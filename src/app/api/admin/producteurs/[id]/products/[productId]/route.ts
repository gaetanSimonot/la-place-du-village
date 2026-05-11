import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/server-auth'

export async function PATCH(req: NextRequest, { params }: { params: { id: string; productId: string } }) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const body = await req.json()
  const fields = ['nom', 'categorie', 'prix_indicatif', 'disponible']
  const update: Record<string, unknown> = {}
  fields.forEach(f => { if (f in body) update[f] = body[f] === '' ? null : body[f] })

  const { data, error } = await supabaseAdmin
    .from('products')
    .update(update)
    .eq('id', params.productId)
    .eq('producer_id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ product: data })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; productId: string } }) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const { error } = await supabaseAdmin
    .from('products')
    .delete()
    .eq('id', params.productId)
    .eq('producer_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
