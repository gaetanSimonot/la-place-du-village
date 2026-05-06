import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function verifyOwner(req: NextRequest, etabId: string, productId: string) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return null
  const { data: etab } = await supabaseAdmin
    .from('etablissements').select('id, user_id').eq('id', etabId).maybeSingle()
  if (!etab || etab.user_id !== user.id) return null
  const { data: product } = await supabaseAdmin
    .from('products').select('id, image_url').eq('id', productId).eq('etablissement_id', etabId).maybeSingle()
  if (!product) return null
  return { product }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; productId: string }> }) {
  const { id, productId } = await params
  const ownership = await verifyOwner(req, id, productId)
  if (!ownership) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { base64 } = await req.json()
  if (!base64) return NextResponse.json({ error: 'Image requise' }, { status: 400 })

  const buffer = Buffer.from(base64, 'base64')
  const path = `products/${productId}.jpg`

  const { error: storageErr } = await supabaseAdmin.storage
    .from('product-images')
    .upload(path, buffer, { contentType: 'image/jpeg', upsert: true })

  if (storageErr) return NextResponse.json({ error: storageErr.message }, { status: 500 })

  const { data: { publicUrl } } = supabaseAdmin.storage.from('product-images').getPublicUrl(path)
  await supabaseAdmin.from('products').update({ image_url: publicUrl }).eq('id', productId)

  return NextResponse.json({ url: publicUrl })
}
