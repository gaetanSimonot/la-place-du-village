import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/server-auth'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

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
