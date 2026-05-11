import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/server-auth'

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx
  const { data } = await supabaseAdmin.from('admin_emails').select('*').order('created_at')
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx
  const { email } = await req.json()
  if (!email?.includes('@')) return NextResponse.json({ error: 'Email invalide' }, { status: 400 })
  const { error } = await supabaseAdmin.from('admin_emails').insert({ email: email.trim().toLowerCase(), added_by: ctx.email })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx
  const { email } = await req.json()
  if (!email) return NextResponse.json({ error: 'Email requis' }, { status: 400 })
  if (email === ctx.email) return NextResponse.json({ error: 'Impossible de se retirer soi-même' }, { status: 400 })
  await supabaseAdmin.from('admin_emails').delete().eq('email', email)
  return NextResponse.json({ ok: true })
}
