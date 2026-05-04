import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function verifyUser(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  return user ?? null
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
  return NextResponse.json({ product: data })
}
