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

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await verifyAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { data, error } = await supabaseAdmin
    .from('products')
    .insert({
      producer_id: params.id,
      nom: body.nom,
      categorie: body.categorie,
      prix_indicatif: body.prix_indicatif || null,
      disponible: body.disponible ?? true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ product: data })
}
