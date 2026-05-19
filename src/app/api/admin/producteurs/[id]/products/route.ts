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

  // Notify followers of new product (mirror /api/mon-producteur/products)
  if (data) {
    const { data: producerFull } = await supabaseAdmin
      .from('producers').select('id, nom').eq('id', params.id).maybeSingle()
    if (producerFull) {
      const { data: followers } = await supabaseAdmin
        .from('producer_followers').select('user_id').eq('producer_id', params.id)
      if (followers && followers.length > 0) {
        await supabaseAdmin.from('notifications').insert(
          followers.map(f => ({
            user_id: f.user_id,
            type: 'nouveau_produit',
            actor_id: null, // producer entity, pas un user — FK exige auth.users
            actor_name: producerFull.nom,
            target_id: producerFull.id,
            target_type: 'producer',
            lu: false,
          }))
        )
      }
    }
  }

  return NextResponse.json({ product: data })
}
