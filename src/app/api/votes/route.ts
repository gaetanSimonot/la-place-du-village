import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !user) return NextResponse.json({ error: 'Token invalide' }, { status: 401 })

  const body = await req.json()
  const { evenement_id } = body
  if (!evenement_id) return NextResponse.json({ error: 'evenement_id requis' }, { status: 400 })

  const { data: existing } = await supabaseAdmin
    .from('votes')
    .select('id')
    .eq('evenement_id', evenement_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) {
    await supabaseAdmin.from('votes').delete().eq('id', existing.id)
    const { data: evt } = await supabaseAdmin.from('evenements').select('vote_count').eq('id', evenement_id).single()
    return NextResponse.json({ voted: false, vote_count: evt?.vote_count ?? 0 })
  } else {
    await supabaseAdmin.from('votes').insert({ evenement_id, user_id: user.id })
    const { data: evt } = await supabaseAdmin.from('evenements').select('vote_count').eq('id', evenement_id).single()
    return NextResponse.json({ voted: true, vote_count: evt?.vote_count ?? 0 })
  }
}
