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

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await verifyAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  // Re-link user si email fourni
  if (body.user_email !== undefined) {
    let user_id: string | null = null
    if (body.user_email) {
      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
      const found = users?.find(u => u.email === body.user_email)
      if (found) user_id = found.id
    }
    body.user_id = user_id
    delete body.user_email
  }

  const fields = ['nom', 'description_courte', 'description_longue', 'commune', 'adresse',
    'lat', 'lng', 'contact_whatsapp', 'contact_tel', 'site_web', 'photos', 'is_max', 'is_featured', 'user_id']
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  fields.forEach(f => { if (f in body) update[f] = body[f] === '' ? null : body[f] })

  const { data, error } = await supabaseAdmin
    .from('producers')
    .update(update)
    .eq('id', params.id)
    .select('*, products(*)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ producer: data })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await verifyAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabaseAdmin.from('producers').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
