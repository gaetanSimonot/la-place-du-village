import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function verifyAdmin(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user?.email) return null
  const { data } = await supabaseAdmin.from('admin_emails').select('email').eq('email', user.email).single()
  return data ? user.email : null
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string; productId: string } }) {
  if (!await verifyAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
  if (!await verifyAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabaseAdmin
    .from('products')
    .delete()
    .eq('id', params.productId)
    .eq('producer_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
