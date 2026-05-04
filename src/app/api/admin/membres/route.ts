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

  // Tous les users auth
  const { data: { users }, error: authErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 })

  // Tous les profils producteurs
  const { data: producers } = await supabaseAdmin
    .from('producers')
    .select('id, user_id, nom, is_max, photos')

  const producerByUser: Record<string, { id: string; nom: string; is_max: boolean; photo: string | null }> = {}
  for (const p of producers ?? []) {
    if (p.user_id) producerByUser[p.user_id] = { id: p.id, nom: p.nom, is_max: p.is_max, photo: (p.photos ?? [])[0] ?? null }
  }

  const membres = (users ?? []).map(u => ({
    id: u.id,
    email: u.email ?? '',
    name: (u.user_metadata?.full_name ?? u.user_metadata?.name ?? '') as string,
    avatar: (u.user_metadata?.avatar_url ?? '') as string,
    created_at: u.created_at,
    last_sign_in: u.last_sign_in_at ?? null,
    producer: producerByUser[u.id] ?? null,
  })).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return NextResponse.json({ membres })
}

// Toggle is_max sur le producteur d'un user
export async function PATCH(req: NextRequest) {
  if (!await verifyAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { producer_id, is_max } = await req.json()
  const { error } = await supabaseAdmin
    .from('producers')
    .update({ is_max, updated_at: new Date().toISOString() })
    .eq('id', producer_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
