import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

/**
 * POST /api/storage/signed-upload-url
 *
 * Genere une URL signee qui autorise UN upload precis vers Supabase Storage.
 * Le browser POSTera ensuite directement chez Supabase, sans transiter par
 * Vercel -> economie massive de Fast Origin Transfer.
 *
 * Le path est genere COTE SERVEUR selon le `kind` envoye par le client :
 * pas de path arbitraire accepte du client (sinon un user pourrait ecrire
 * sur le path d un autre, ou hors du bucket attendu).
 *
 * Body : { kind, mimeType, size, refId? }
 *   - kind 'event-image'    : event en cours de creation (random path)
 *   - kind 'product-image'  : product image, refId = product id (ownership check)
 *   - kind 'admin-edit'     : admin uniquement, edits hero/carousel
 *   - kind 'profile-banner' : banniere du profil de l user authentifie (path fixe par userId)
 *
 * Returns : { uploadUrl, token, publicUrl, path, bucket }
 */

type UploadKind = 'event-image' | 'product-image' | 'admin-edit' | 'profile-banner' | 'profile-avatar' | 'hub-hero-intro' | 'post-media'

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB (max bucket configure)

function extFromMime(mime: string): 'jpg' | 'png' | 'webp' {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  return 'jpg'
}

function randomName(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export async function POST(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const body = await req.json().catch(() => ({}))
  const kind = body?.kind as UploadKind | undefined
  const mimeType = String(body?.mimeType ?? '')
  const size = Number(body?.size ?? 0)
  const refId = body?.refId ? String(body.refId) : null

  if (!kind || !['event-image', 'product-image', 'admin-edit', 'profile-banner', 'profile-avatar', 'hub-hero-intro', 'post-media'].includes(kind)) {
    return NextResponse.json({ error: 'kind invalide' }, { status: 400 })
  }
  if (!ALLOWED_MIME.has(mimeType)) {
    return NextResponse.json({ error: 'MIME non autorisé (JPEG/PNG/WebP uniquement)' }, { status: 400 })
  }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) {
    return NextResponse.json({ error: 'Taille invalide' }, { status: 400 })
  }

  // Calcul du bucket + path selon kind (server-side, jamais user-controlled)
  let bucket: string
  let path: string

  if (kind === 'event-image') {
    // Tout user authentifie peut creer un event -> path random dans formulaire/
    bucket = 'event-images'
    path = `formulaire/${randomName()}.${extFromMime(mimeType)}`
  } else if (kind === 'admin-edit') {
    if (!ctx.isAdmin) {
      return NextResponse.json({ error: 'Admin uniquement' }, { status: 403 })
    }
    bucket = 'event-images'
    path = `edits/${randomName()}.${extFromMime(mimeType)}`
  } else if (kind === 'product-image') {
    if (!refId) {
      return NextResponse.json({ error: 'refId (product id) requis' }, { status: 400 })
    }
    // Ownership check : l user doit owner le product (via producer ou etab)
    const { data: product } = await supabaseAdmin
      .from('products')
      .select('id, producer_id, etablissement_id')
      .eq('id', refId)
      .maybeSingle()
    if (!product) {
      return NextResponse.json({ error: 'Produit introuvable' }, { status: 404 })
    }
    let isOwner = false
    if (product.producer_id) {
      const { data: producer } = await supabaseAdmin
        .from('producers')
        .select('user_id')
        .eq('id', product.producer_id)
        .maybeSingle()
      isOwner = producer?.user_id === ctx.userId
    }
    if (!isOwner && product.etablissement_id) {
      const { data: etab } = await supabaseAdmin
        .from('etablissements')
        .select('user_id')
        .eq('id', product.etablissement_id)
        .maybeSingle()
      isOwner = etab?.user_id === ctx.userId
    }
    if (!isOwner && !ctx.isAdmin) {
      return NextResponse.json({ error: 'Pas propriétaire de ce produit' }, { status: 403 })
    }
    bucket = 'product-images'
    // Path fixe par product : ecrase l image precedente automatiquement
    path = `products/${refId}.jpg`
  } else if (kind === 'profile-banner') {
    // Path FIXE par userId : on ecrase la banniere precedente. Le serveur impose
    // le userId du token Bearer, jamais un userId envoye par le client → impossible
    // d ecrire sur le path d un autre user.
    bucket = 'avatars'
    path = `banners/${ctx.userId}.${extFromMime(mimeType)}`
  } else if (kind === 'profile-avatar') {
    // Path FIXE par userId : meme principe que la banniere. Bucket 'avatars',
    // dossier 'avatars/' pour distinguer des banners.
    bucket = 'avatars'
    path = `avatars/${ctx.userId}.${extFromMime(mimeType)}`
  } else if (kind === 'hub-hero-intro') {
    // Image du slide intro "Bouche-a-oreille" du carrousel hub_hero.
    // Admin uniquement. Path fixe -> upsert ecrase l'image precedente.
    if (!ctx.isAdmin) {
      return NextResponse.json({ error: 'Admin uniquement' }, { status: 403 })
    }
    bucket = 'avatars'
    path = `hub/hero-intro.${extFromMime(mimeType)}`
  } else if (kind === 'post-media') {
    // Média joint à un post (mur) ou un message (chat) — tout user authentifié.
    // Path random sous son propre userId → pas d'écrasement, pas d'accès croisé.
    bucket = 'reference-photos'
    path = `posts/${ctx.userId}/${randomName()}.${extFromMime(mimeType)}`
  } else {
    return NextResponse.json({ error: 'kind non géré' }, { status: 400 })
  }

  // Genere l URL signee (token a courte duree de vie, default ~2 min)
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUploadUrl(path, { upsert: kind === 'product-image' || kind === 'profile-banner' || kind === 'profile-avatar' || kind === 'hub-hero-intro' })

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Erreur signed URL' }, { status: 500 })
  }

  const { data: { publicUrl } } = supabaseAdmin.storage.from(bucket).getPublicUrl(path)

  return NextResponse.json({
    uploadUrl: data.signedUrl,
    token: data.token,
    publicUrl,
    path,
    bucket,
  })
}
