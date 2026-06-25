import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function verifyUser(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  return user ?? null
}

/** GET — la promo est-elle en favori pour l'user ? */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ favorited: false })

  const { data } = await supabaseAdmin
    .from('promotion_favorites')
    .select('id')
    .eq('user_id', user.id)
    .eq('promotion_id', id)
    .maybeSingle()

  return NextResponse.json({ favorited: !!data })
}

/** POST — toggle favori. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: existing } = await supabaseAdmin
    .from('promotion_favorites')
    .select('id')
    .eq('user_id', user.id)
    .eq('promotion_id', id)
    .maybeSingle()

  if (existing) {
    const { error } = await supabaseAdmin.from('promotion_favorites')
      .delete().eq('user_id', user.id).eq('promotion_id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ favorited: false })
  }

  const { error } = await supabaseAdmin.from('promotion_favorites')
    .insert({ user_id: user.id, promotion_id: id })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ favorited: true })
}
