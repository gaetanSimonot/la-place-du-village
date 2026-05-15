import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function verifyOwner(req: NextRequest, etabId: string) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return null
  const { data: etab } = await supabaseAdmin
    .from('etablissements').select('id, user_id, plan').eq('id', etabId).maybeSingle()
  if (!etab || etab.user_id !== user.id) return null
  return { user, etab }
}

const CAT_SUFFIX: Record<string, string> = {
  fruits_legumes: 'fresh market farm', viandes: 'meat farm butcher',
  fromages_laitages: 'cheese dairy artisan', oeufs: 'eggs farm fresh',
  pain: 'bread bakery artisan', miel: 'honey jar artisan',
  panier: 'vegetable basket market', plantes: 'plant garden',
  huiles: 'oil bottle artisan', boissons: 'drink bottle local',
  artisanat: 'handmade craft artisan', autre: 'farm local market',
}

async function fetchPexelsUrl(nom: string, categorie: string): Promise<string | null> {
  const key = process.env.PEXELS_API_KEY
  if (!key) return null
  const suffix = CAT_SUFFIX[categorie] ?? 'farm fresh'
  const query = nom ? `${nom} ${suffix}` : suffix
  try {
    const r = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=8&page=1&orientation=square`,
      { headers: { Authorization: key } }
    )
    if (!r.ok) return null
    const d = await r.json()
    const photos = d.photos ?? []
    if (!photos.length) return null
    return photos[Math.floor(Math.random() * photos.length)].src.medium ?? null
  } catch { return null }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data } = await supabaseAdmin
    .from('products').select('*').eq('etablissement_id', id).order('categorie', { ascending: true })
  return NextResponse.json({ products: data ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ownership = await verifyOwner(req, id)
  if (!ownership) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  if (ownership.etab.plan !== 'pro') return NextResponse.json({ error: 'Plan Partenaire Local requis' }, { status: 403 })

  const body = await req.json()
  const { data, error } = await supabaseAdmin
    .from('products')
    .insert({
      etablissement_id: id,
      nom: body.nom,
      categorie: body.categorie,
      prix_indicatif: body.prix_indicatif || null,
      disponible: body.disponible ?? true,
      periode_dispo: body.periode_dispo || null,
      dispo_jusqu_au: body.dispo_jusqu_au || null,
    })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const imageUrl = await fetchPexelsUrl(body.nom, body.categorie)
  if (imageUrl && data) {
    await supabaseAdmin.from('products').update({ image_url: imageUrl }).eq('id', data.id)
    ;(data as Record<string, unknown>).image_url = imageUrl
  }

  return NextResponse.json({ product: data })
}
