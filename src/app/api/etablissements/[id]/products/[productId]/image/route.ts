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

// POST: finalise une image custom apres upload direct client -> Supabase
// (via signed URL). Le client passe juste image_url, on l ecrit en DB.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; productId: string }> }) {
  const { id, productId } = await params
  const ownership = await verifyOwner(req, id, productId)
  if (!ownership) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { image_url } = await req.json()
  if (!image_url || typeof image_url !== 'string') {
    return NextResponse.json({ error: 'image_url requis' }, { status: 400 })
  }
  // Anti-injection : l URL doit pointer sur notre Supabase Storage
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  if (!image_url.startsWith(supaUrl + '/storage/v1/object/public/product-images/')) {
    return NextResponse.json({ error: 'image_url invalide' }, { status: 400 })
  }

  await supabaseAdmin.from('products').update({ image_url }).eq('id', productId)
  return NextResponse.json({ url: image_url })
}
