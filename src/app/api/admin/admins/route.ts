import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function verifyAdmin(req: NextRequest): Promise<string | null> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user?.email) return null
  const { data } = await supabaseAdmin.from('admin_emails').select('email').eq('email', user.email).single()
  return data ? user.email : null
}

export async function GET(req: NextRequest) {
  const email = await verifyAdmin(req)
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data } = await supabaseAdmin.from('admin_emails').select('*').order('created_at')
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const callerEmail = await verifyAdmin(req)
  if (!callerEmail) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { email } = await req.json()
  if (!email?.includes('@')) return NextResponse.json({ error: 'Email invalide' }, { status: 400 })
  const { error } = await supabaseAdmin.from('admin_emails').insert({ email: email.trim().toLowerCase(), added_by: callerEmail })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const callerEmail = await verifyAdmin(req)
  if (!callerEmail) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { email } = await req.json()
  if (!email) return NextResponse.json({ error: 'Email requis' }, { status: 400 })
  if (email === callerEmail) return NextResponse.json({ error: 'Impossible de se retirer soi-même' }, { status: 400 })
  await supabaseAdmin.from('admin_emails').delete().eq('email', email)
  return NextResponse.json({ ok: true })
}
