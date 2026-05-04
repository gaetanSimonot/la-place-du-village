import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function verifyUser(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  return user ?? null
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ following: false })

  const { data } = await supabaseAdmin
    .from('producer_followers')
    .select('user_id')
    .eq('user_id', user.id)
    .eq('producer_id', params.id)
    .maybeSingle()

  return NextResponse.json({ following: !!data })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: existing } = await supabaseAdmin
    .from('producer_followers')
    .select('user_id')
    .eq('user_id', user.id)
    .eq('producer_id', params.id)
    .maybeSingle()

  if (existing) {
    await supabaseAdmin.from('producer_followers')
      .delete().eq('user_id', user.id).eq('producer_id', params.id)
    return NextResponse.json({ following: false })
  }

  await supabaseAdmin.from('producer_followers')
    .insert({ user_id: user.id, producer_id: params.id })
  return NextResponse.json({ following: true })
}
