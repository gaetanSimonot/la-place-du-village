import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

/**
 * GET  /api/newsletter/me        — état d'abonnement de l'utilisateur courant.
 * POST /api/newsletter/me {optin}— l'utilisateur s'abonne / se désabonne.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx
  const { data } = await supabaseAdmin.from('profiles').select('newsletter_optin').eq('user_id', ctx.userId).maybeSingle()
  return NextResponse.json({ optin: !!data?.newsletter_optin })
}

export async function POST(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx
  const { optin } = await req.json().catch(() => ({}))
  if (typeof optin !== 'boolean') return NextResponse.json({ error: 'optin requis' }, { status: 400 })
  const { error } = await supabaseAdmin.from('profiles').update({ newsletter_optin: optin }).eq('user_id', ctx.userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, optin })
}
