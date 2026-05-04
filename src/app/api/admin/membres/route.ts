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

export async function GET(req: NextRequest) {
  if (!await verifyAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { users }, error: authErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 })

  const [{ data: producers }, { data: profilesData }] = await Promise.all([
    supabaseAdmin.from('producers').select('id, user_id, nom, is_max, photos, commune'),
    supabaseAdmin.from('profiles').select('id, plan, pro_type, display_name'),
  ])

  const producerByUser: Record<string, { id: string; nom: string; is_max: boolean; photo: string | null; commune: string | null }> = {}
  for (const p of producers ?? []) {
    if (p.user_id) producerByUser[p.user_id] = { id: p.id, nom: p.nom, is_max: p.is_max, photo: (p.photos ?? [])[0] ?? null, commune: p.commune ?? null }
  }

  const profileByUser: Record<string, { plan: string; pro_type: string | null; display_name: string | null }> = {}
  for (const p of profilesData ?? []) {
    profileByUser[p.id] = { plan: p.plan, pro_type: p.pro_type, display_name: p.display_name }
  }

  const membres = (users ?? []).map(u => {
    const profile = profileByUser[u.id]
    const producer = producerByUser[u.id] ?? null
    const plan = profile?.plan ?? (producer?.is_max ? 'max' : 'basic')
    return {
      id: u.id,
      email: u.email ?? '',
      name: (profile?.display_name ?? u.user_metadata?.full_name ?? u.user_metadata?.name ?? '') as string,
      avatar: (u.user_metadata?.avatar_url ?? '') as string,
      created_at: u.created_at,
      last_sign_in: u.last_sign_in_at ?? null,
      plan,
      pro_type: profile?.pro_type ?? null,
      display_name: profile?.display_name ?? null,
      bio: null,
      producer,
    }
  }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return NextResponse.json({ membres })
}

export async function PATCH(req: NextRequest) {
  if (!await verifyAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  // Update plan + profile info
  if ('user_id' in body) {
    const { user_id, plan, pro_type, display_name } = body

    // Check if profile row exists — if not, we need to create it with all required columns
    const { data: existing } = await supabaseAdmin
      .from('profiles').select('id').eq('id', user_id).maybeSingle()

    let error
    if (existing) {
      ;({ error } = await supabaseAdmin.from('profiles').update({
        plan: plan ?? 'basic',
        pro_type: pro_type || null,
        display_name: display_name || null,
        updated_at: new Date().toISOString(),
      }).eq('id', user_id))
    } else {
      // No row yet — insert with only the columns we know exist
      const { data: { user: authUser } } = await supabaseAdmin.auth.admin.getUserById(user_id)
      ;({ error } = await supabaseAdmin.from('profiles').insert({
        id: user_id,
        display_name: display_name || authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || null,
        plan: plan ?? 'basic',
        pro_type: pro_type || null,
        updated_at: new Date().toISOString(),
      }))
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Sync is_max on producer for backward compat with the public annuaire API
    const { data: prod } = await supabaseAdmin
      .from('producers').select('id').eq('user_id', user_id).maybeSingle()
    if (prod) {
      await supabaseAdmin.from('producers')
        .update({ is_max: plan === 'max', updated_at: new Date().toISOString() })
        .eq('id', prod.id)
    }

    return NextResponse.json({ success: true })
  }

  // Legacy: direct is_max toggle (still used internally)
  if ('producer_id' in body) {
    const { producer_id, is_max } = body
    const { error } = await supabaseAdmin
      .from('producers')
      .update({ is_max, updated_at: new Date().toISOString() })
      .eq('id', producer_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
}
