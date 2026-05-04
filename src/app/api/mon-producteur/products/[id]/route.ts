import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function verifyUser(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  return user ?? null
}

async function verifyOwnership(userId: string, productId: string) {
  const { data } = await supabaseAdmin
    .from('products')
    .select('id, nom, disponible, producer_id, producers!inner(id, nom, user_id)')
    .eq('id', productId)
    .maybeSingle()
  if (!data) return null
  const prod = (Array.isArray(data.producers) ? data.producers[0] : data.producers) as { id: string; nom: string; user_id: string }
  if (prod?.user_id !== userId) return null
  return { ...data, producer: prod }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const item = await verifyOwnership(user.id, params.id)
  if (!item) return NextResponse.json({ error: 'Non trouvé' }, { status: 404 })

  const body = await req.json()

  // Send notifications when product becomes available
  if (body.disponible === true && !item.disponible) {
    const { data: followers } = await supabaseAdmin
      .from('producer_followers')
      .select('user_id')
      .eq('producer_id', item.producer.id)

    if (followers && followers.length > 0) {
      let periodeLabel = ''
      if (body.periode_dispo === 'semaine') periodeLabel = ' cette semaine'
      else if (body.periode_dispo === 'weekend') periodeLabel = ' ce weekend'
      else if (body.periode_dispo === 'date' && body.dispo_jusqu_au) {
        const d = new Date(body.dispo_jusqu_au)
        periodeLabel = ` jusqu'au ${d.getDate()}/${d.getMonth() + 1}`
      }

      await supabaseAdmin.from('notifications').insert(
        followers.map(f => ({
          user_id: f.user_id,
          type: 'disponibilite',
          producer_id: item.producer.id,
          producer_nom: item.producer.nom,
          message: `${item.producer.nom} a ${item.nom} disponible${periodeLabel}`,
          read: false,
        }))
      )
    }
  }

  const { data, error } = await supabaseAdmin
    .from('products')
    .update({
      disponible: body.disponible ?? item.disponible,
      periode_dispo: body.periode_dispo ?? null,
      dispo_jusqu_au: (body.dispo_jusqu_au === '' ? null : body.dispo_jusqu_au) ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ product: data })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const item = await verifyOwnership(user.id, params.id)
  if (!item) return NextResponse.json({ error: 'Non trouvé' }, { status: 404 })

  const { error } = await supabaseAdmin.from('products').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
