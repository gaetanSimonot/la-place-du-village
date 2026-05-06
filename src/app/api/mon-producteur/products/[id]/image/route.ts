import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function verifyUser(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  return user ?? null
}

async function verifyOwnership(userId: string, productId: string) {
  const { data: product } = await supabaseAdmin
    .from('products').select('id, nom, categorie, image_url, producer_id').eq('id', productId).maybeSingle()
  if (!product) return null
  const { data: producer } = await supabaseAdmin
    .from('producers').select('id, user_id').eq('id', product.producer_id).maybeSingle()
  if (!producer || producer.user_id !== userId) return null
  return { ...product }
}

const CAT_QUERIES: Record<string, string> = {
  fruits_legumes: 'fresh vegetables fruits', viandes: 'fresh meat butcher',
  fromages_laitages: 'cheese dairy fresh', oeufs: 'eggs farm fresh',
  pain: 'artisan bread bakery', miel: 'honey jar organic',
  panier: 'vegetable basket farm', plantes: 'plants flowers garden',
  huiles: 'olive oil condiments', boissons: 'wine beverages',
  artisanat: 'handmade craft artisan', autre: 'local farm market',
}

async function fetchPexelsUrl(nom: string, categorie: string): Promise<string | null> {
  const key = process.env.PEXELS_API_KEY
  if (!key) return null
  const query = nom || CAT_QUERIES[categorie] || 'local farm'
  try {
    const r = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=8&page=${Math.ceil(Math.random() * 3)}&orientation=square`,
      { headers: { Authorization: key } }
    )
    if (!r.ok) return null
    const d = await r.json()
    const photos = d.photos ?? []
    if (!photos.length) return null
    return photos[Math.floor(Math.random() * photos.length)].src.medium ?? null
  } catch { return null }
}

// POST: upload custom image (base64 → Supabase Storage)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const item = await verifyOwnership(user.id, id)
  if (!item) return NextResponse.json({ error: 'Non trouvé' }, { status: 404 })

  const { base64 } = await req.json()
  if (!base64) return NextResponse.json({ error: 'Image requise' }, { status: 400 })

  const buffer = Buffer.from(base64, 'base64')
  const path = `products/${id}.jpg`

  const { error: storageErr } = await supabaseAdmin.storage
    .from('product-images')
    .upload(path, buffer, { contentType: 'image/jpeg', upsert: true })

  if (storageErr) return NextResponse.json({ error: storageErr.message }, { status: 500 })

  const { data: { publicUrl } } = supabaseAdmin.storage.from('product-images').getPublicUrl(path)
  await supabaseAdmin.from('products').update({ image_url: publicUrl }).eq('id', id)

  return NextResponse.json({ url: publicUrl })
}

// DELETE: remove custom image → revert to Pexels
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const item = await verifyOwnership(user.id, id)
  if (!item) return NextResponse.json({ error: 'Non trouvé' }, { status: 404 })

  // Remove from storage if custom (not Pexels)
  if (item.image_url && !item.image_url.includes('pexels.com')) {
    await supabaseAdmin.storage.from('product-images').remove([`products/${id}.jpg`]).catch(() => {})
  }

  const pexelsUrl = await fetchPexelsUrl(item.nom, item.categorie)
  await supabaseAdmin.from('products').update({ image_url: pexelsUrl }).eq('id', id)

  return NextResponse.json({ url: pexelsUrl })
}
