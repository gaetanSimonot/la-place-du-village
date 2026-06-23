import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser, notifyByAudience, notifyUser } from '@/lib/server-auth'
import { sanitizeMedia } from '@/lib/postMedia'

const NOTIFY_AUDIENCES = ['all', 'basic', 'habitants', 'pro'] as const
type NotifyAudience = (typeof NOTIFY_AUDIENCES)[number]

const VISIBILITY = ['public', 'amis', 'prive'] as const
type Visibility = (typeof VISIBILITY)[number]

const MAX_LEN = 2000

/**
 * Création d'un post sur le mur de l'utilisateur authentifié.
 *
 * Sécurité :
 * - requireUser : scope auth.uid()
 * - user_id forcé à ctx.userId (pas accepté en body) → impossible de
 *   poster sur le mur de quelqu'un d'autre
 * - Validation texte 1..2000 chars + visibility whitelist
 */
export async function POST(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const body = await req.json().catch(() => ({}))
  const { texte, visibility, embed_kind, embed_ref_id, notify, media } = body as {
    texte?: unknown; visibility?: unknown;
    embed_kind?: unknown; embed_ref_id?: unknown; notify?: unknown; media?: unknown
  }

  const cleanMedia = sanitizeMedia(media)

  if (typeof texte !== 'string') {
    return NextResponse.json({ error: 'Texte requis' }, { status: 400 })
  }
  const trimmed = texte.trim()
  // Un post peut être vide en texte s'il porte au moins un média.
  if (trimmed.length === 0 && cleanMedia.length === 0) {
    return NextResponse.json({ error: 'Texte vide' }, { status: 400 })
  }
  if (trimmed.length > MAX_LEN) {
    return NextResponse.json({ error: `Texte trop long (max ${MAX_LEN})` }, { status: 400 })
  }

  let vis: Visibility = 'public'
  if (typeof visibility === 'string' && (VISIBILITY as readonly string[]).includes(visibility)) {
    vis = visibility as Visibility
  }

  // Validation embed optionnel
  const ALLOWED_KINDS = ['event','etab','producer','annonce','promo','covoit','article']
  let validEmbedKind: string | null = null
  let validEmbedRefId: string | null = null
  if (embed_kind != null && embed_ref_id != null) {
    if (typeof embed_kind !== 'string' || !ALLOWED_KINDS.includes(embed_kind)) {
      return NextResponse.json({ error: 'embed_kind invalide' }, { status: 400 })
    }
    // embed_ref_id : string non vide, ≤ 128 chars. Pas de regex UUID stricte.
    if (typeof embed_ref_id !== 'string' || embed_ref_id.length === 0 || embed_ref_id.length > 128) {
      return NextResponse.json({ error: 'embed_ref_id invalide' }, { status: 400 })
    }
    validEmbedKind = embed_kind
    validEmbedRefId = embed_ref_id
  }

  const { data, error } = await supabaseAdmin
    .from('posts')
    .insert({
      user_id: ctx.userId,
      texte: trimmed,
      visibility: vis,
      embed_kind: validEmbedKind,
      embed_ref_id: validEmbedRefId,
      media: cleanMedia.length > 0 ? cleanMedia : null,
    })
    .select('id, user_id, texte, visibility, embed_kind, embed_ref_id, media, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // ── Broadcast notif (ADMIN uniquement) ──────────────────────────────────
  // Sécurité : on ne fait confiance qu'à ctx.isAdmin côté serveur, jamais au
  // body. Fail-silent : si la notif échoue, le post reste publié.
  if (
    data &&
    ctx.isAdmin &&
    typeof notify === 'string' &&
    (NOTIFY_AUDIENCES as readonly string[]).includes(notify)
  ) {
    const { data: prof } = await supabaseAdmin
      .from('profiles').select('display_name').eq('user_id', ctx.userId).maybeSingle()
    const payload = {
      type:       'post_broadcast' as const,
      actor_name: prof?.display_name ?? 'La Place du Village',
      target_id:  data.id,
    }
    // GARDE-FOU : le vrai broadcast à tous ne part qu'en PRODUCTION. Sur
    // preview/dev (même DB Supabase partagée), on ne notifie QUE l'admin
    // lui-même → on peut tester toute l'UX sans spammer les vrais users.
    if (process.env.VERCEL_ENV === 'production') {
      // Pas d'exclusion : l'admin fait partie de "tout le monde", il reçoit
      // la notif lui aussi (demande explicite).
      await notifyByAudience(notify as NotifyAudience, payload)
    } else {
      await notifyUser(ctx.userId, payload)
    }
  }

  return NextResponse.json({ post: data }, { status: 201 })
}
