import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function verifyUser(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  return user ?? null
}

const CAT_QUERIES: Record<string, string> = {
  fruits_legumes: 'fresh vegetables fruits',
  viandes: 'fresh meat butcher',
  fromages_laitages: 'cheese dairy fresh',
  oeufs: 'eggs farm fresh',
  pain: 'artisan bread bakery',
  miel: 'honey jar organic',
  panier: 'vegetable basket farm',
  plantes: 'plants flowers garden',
  huiles: 'olive oil condiments',
  boissons: 'wine beverages',
  artisanat: 'handmade craft artisan',
  autre: 'local farm market',
}

async function fetchPexelsUrl(nom: string, categorie: string): Promise<string | null> {
  const key = process.env.PEXELS_API_KEY
  if (!key) return null
  const query = nom || CAT_QUERIES[categorie] || 'local farm'
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

export async function POST(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: producer } = await supabaseAdmin
    .from('producers').select('id').eq('user_id', user.id).maybeSingle()
  if (!producer) return NextResponse.json({ error: 'Fiche non trouvée' }, { status: 404 })

  const body = await req.json()
  const { data, error } = await supabaseAdmin
    .from('products')
    .insert({
      producer_id: producer.id,
      nom: body.nom,
      categorie: body.categorie,
      prix_indicatif: body.prix_indicatif || null,
      disponible: body.disponible ?? true,
      periode_dispo: body.periode_dispo || null,
      dispo_jusqu_au: body.dispo_jusqu_au || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auto-fetch Pexels image
  const imageUrl = await fetchPexelsUrl(body.nom, body.categorie)
  if (imageUrl && data) {
    await supabaseAdmin.from('products').update({ image_url: imageUrl }).eq('id', data.id)
    ;(data as Record<string, unknown>).image_url = imageUrl
  }

  return NextResponse.json({ product: data })
}
