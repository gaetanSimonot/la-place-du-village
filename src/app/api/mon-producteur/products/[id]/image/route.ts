import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { validateImageUpload } from '@/lib/imageUpload'

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

const CAT_SUFFIX: Record<string, string> = {
  fruits_legumes: 'fresh market farm',
  viandes: 'meat farm butcher',
  fromages_laitages: 'cheese dairy artisan',
  oeufs: 'eggs farm fresh',
  pain: 'bread bakery artisan',
  miel: 'honey jar artisan',
  panier: 'vegetable basket market',
  plantes: 'plant garden',
  huiles: 'oil bottle artisan',
  boissons: 'drink bottle local',
  artisanat: 'handmade craft artisan',
  autre: 'farm local market',
}

async function fetchPexelsUrl(nom: string, categorie: string): Promise<{ url: string | null; reason?: string }> {
  const key = process.env.PEXELS_API_KEY
  if (!key) return { url: null, reason: 'no_key' }
  const suffix = CAT_SUFFIX[categorie] ?? 'farm fresh'
  const query = nom ? `${nom} ${suffix}` : suffix
  try {
    const r = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=8&page=${Math.ceil(Math.random() * 3)}&orientation=square`,
      { headers: { Authorization: key } }
    )
    if (!r.ok) return { url: null, reason: `pexels_${r.status}` }
    const d = await r.json()
    const photos = d.photos ?? []
    if (!photos.length) return { url: null, reason: 'no_photos' }
    return { url: photos[Math.floor(Math.random() * photos.length)].src.medium ?? null }
  } catch (e) { return { url: null, reason: String(e) } }
}

// POST: upload custom image (base64 → Supabase Storage)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const item = await verifyOwnership(user.id, id)
  if (!item) return NextResponse.json({ error: 'Non trouvé' }, { status: 404 })

  const { base64, mimeType } = await req.json()
  const v = validateImageUpload(base64, mimeType)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status })

  const path = `products/${id}.jpg`

  const { error: storageErr } = await supabaseAdmin.storage
    .from('product-images')
    .upload(path, v.buffer, { contentType: v.mimeType, upsert: true })

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

  const { url: pexelsUrl, reason } = await fetchPexelsUrl(item.nom, item.categorie)
  if (pexelsUrl) await supabaseAdmin.from('products').update({ image_url: pexelsUrl }).eq('id', id)

  return NextResponse.json({ url: pexelsUrl, debug: reason ?? null })
}
