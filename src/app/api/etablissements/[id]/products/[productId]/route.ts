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
    .from('products').select('*').eq('id', productId).eq('etablissement_id', etabId).maybeSingle()
  if (!product) return null
  return { user, etab, product }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; productId: string }> }) {
  const { id, productId } = await params
  const ownership = await verifyOwner(req, id, productId)
  if (!ownership) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json()
  const { data, error } = await supabaseAdmin
    .from('products')
    .update({
      ...(body.nom !== undefined ? { nom: body.nom } : {}),
      ...(body.categorie !== undefined ? { categorie: body.categorie } : {}),
      ...(body.prix_indicatif !== undefined ? { prix_indicatif: body.prix_indicatif || null } : {}),
      disponible: body.disponible ?? ownership.product.disponible,
      periode_dispo: body.periode_dispo ?? null,
      dispo_jusqu_au: (body.dispo_jusqu_au === '' ? null : body.dispo_jusqu_au) ?? null,
    })
    .eq('id', productId)
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ product: data })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; productId: string }> }) {
  const { id, productId } = await params
  const ownership = await verifyOwner(req, id, productId)
  if (!ownership) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { error } = await supabaseAdmin.from('products').delete().eq('id', productId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
