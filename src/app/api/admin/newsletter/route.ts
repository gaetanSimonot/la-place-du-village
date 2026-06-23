import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/server-auth'
import { welcomeProfile, welcomeExtra } from '@/lib/newsletterWelcome'

/**
 * GET    /api/admin/newsletter           — compteurs + emails ajoutés à la main
 * POST   /api/admin/newsletter { email } — ajoute un email à la liste abonnés
 *        (si un profil a cet email → optin=true ; sinon → newsletter_extra_emails)
 * DELETE /api/admin/newsletter?email=     — retire un email de la liste
 */

const norm = (s: string) => s.trim().toLowerCase()
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const [sub, non, extra] = await Promise.all([
    supabaseAdmin.from('profiles').select('user_id', { count: 'exact', head: true }).eq('newsletter_optin', true).not('email', 'is', null),
    supabaseAdmin.from('profiles').select('user_id', { count: 'exact', head: true }).eq('newsletter_optin', false).not('email', 'is', null),
    supabaseAdmin.from('newsletter_extra_emails').select('id, email, created_at').order('created_at', { ascending: false }),
  ])
  const extraList = extra.data ?? []
  return NextResponse.json({
    subscribers: (sub.count ?? 0) + extraList.length,
    nonSubscribers: non.count ?? 0,
    extra: extraList,
  })
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const { email } = await req.json().catch(() => ({}))
  const e = norm(String(email ?? ''))
  if (!isEmail(e)) return NextResponse.json({ error: 'Email invalide' }, { status: 400 })

  // Si un compte a cet email → on l'abonne directement.
  const { data: prof } = await supabaseAdmin.from('profiles').select('user_id').eq('email', e).maybeSingle()
  if (prof) {
    await supabaseAdmin.from('profiles').update({ newsletter_optin: true }).eq('user_id', prof.user_id)
    await welcomeProfile(prof.user_id as string).catch(() => {})   // édition active auto
    return NextResponse.json({ success: true, type: 'profile' })
  }
  // Sinon → email externe.
  const { error } = await supabaseAdmin.from('newsletter_extra_emails').upsert({ email: e }, { onConflict: 'email', ignoreDuplicates: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await welcomeExtra(e).catch(() => {})   // édition active auto
  return NextResponse.json({ success: true, type: 'extra' })
}

export async function DELETE(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const e = norm(new URL(req.url).searchParams.get('email') ?? '')
  if (!e) return NextResponse.json({ error: 'email requis' }, { status: 400 })

  await supabaseAdmin.from('profiles').update({ newsletter_optin: false }).eq('email', e)
  await supabaseAdmin.from('newsletter_extra_emails').delete().eq('email', e)
  return NextResponse.json({ success: true })
}
