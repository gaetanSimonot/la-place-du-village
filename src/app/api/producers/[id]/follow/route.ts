import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function verifyUser(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  return user ?? null
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ following: false })

  const { data } = await supabaseAdmin
    .from('producer_followers')
    .select('user_id')
    .eq('user_id', user.id)
    .eq('producer_id', id)
    .maybeSingle()

  return NextResponse.json({ following: !!data })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: existing } = await supabaseAdmin
    .from('producer_followers')
    .select('user_id')
    .eq('user_id', user.id)
    .eq('producer_id', id)
    .maybeSingle()

  if (existing) {
    const { error } = await supabaseAdmin.from('producer_followers')
      .delete().eq('user_id', user.id).eq('producer_id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ following: false })
  }

  const { error } = await supabaseAdmin.from('producer_followers')
    .insert({ user_id: user.id, producer_id: id })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify producer owner of new follower
  const { data: producer } = await supabaseAdmin
    .from('producers').select('user_id, nom').eq('id', id).maybeSingle()
  if (producer?.user_id && producer.user_id !== user.id) {
    const { data: followerProfile } = await supabaseAdmin
      .from('profiles').select('display_name').eq('user_id', user.id).maybeSingle()
    await supabaseAdmin.from('notifications').insert({
      user_id: producer.user_id,
      type: 'suivi_producteur',
      actor_id: user.id,
      actor_name: followerProfile?.display_name ?? 'Quelqu\'un',
      target_id: id,
      target_type: 'producer',
      lu: false,
    })
  }

  return NextResponse.json({ following: true })
}
