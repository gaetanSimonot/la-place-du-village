import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendPushToUsers } from '@/lib/push'

async function verifyUser(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  return user ?? null
}

async function verifyOwnership(userId: string, productId: string) {
  const { data: product } = await supabaseAdmin
    .from('products')
    .select('id, nom, disponible, producer_id')
    .eq('id', productId)
    .maybeSingle()
  if (!product) return null
  const { data: producer } = await supabaseAdmin
    .from('producers')
    .select('id, nom, user_id')
    .eq('id', product.producer_id)
    .maybeSingle()
  if (!producer || producer.user_id !== userId) return null
  return { ...product, producer }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const item = await verifyOwnership(user.id, id)
  if (!item) return NextResponse.json({ error: 'Non trouvé' }, { status: 404 })

  const body = await req.json()

  // Send notifications when product becomes available
  if (body.disponible === true && !item.disponible) {
    const { data: followers } = await supabaseAdmin
      .from('producer_followers')
      .select('user_id')
      .eq('producer_id', item.producer.id)

    if (followers && followers.length > 0) {
      await supabaseAdmin.from('notifications').insert(
        followers.map(f => ({
          user_id: f.user_id,
          type: 'disponibilite',
          actor_id: null, // producer entity, pas un user — FK exige auth.users
          actor_name: item.producer.nom,
          target_id: item.producer.id,
          target_type: 'producer',
          lu: false,
        }))
      )
      await sendPushToUsers(followers.map(f => f.user_id), {
        type: 'disponibilite',
        actor_name: item.producer.nom,
        target_type: 'producer',
        target_id: item.producer.id,
      })
    }
  }

  const { data, error } = await supabaseAdmin
    .from('products')
    .update({
      ...(body.nom !== undefined ? { nom: body.nom } : {}),
      ...(body.categorie !== undefined ? { categorie: body.categorie } : {}),
      ...(body.prix_indicatif !== undefined ? { prix_indicatif: body.prix_indicatif || null } : {}),
      disponible: body.disponible ?? item.disponible,
      periode_dispo: body.periode_dispo ?? null,
      dispo_jusqu_au: (body.dispo_jusqu_au === '' ? null : body.dispo_jusqu_au) ?? null,
      ...(body.image_url !== undefined ? { image_url: body.image_url ?? null } : {}),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ product: data })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const item = await verifyOwnership(user.id, id)
  if (!item) return NextResponse.json({ error: 'Non trouvé' }, { status: 404 })

  const { error } = await supabaseAdmin.from('products').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
