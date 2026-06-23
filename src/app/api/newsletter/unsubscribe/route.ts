import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * Désabonnement par token, cible de l'en-tête List-Unsubscribe.
 *  - POST  ?token=… → désabo « 1 clic » (RFC 8058, déclenché par Gmail/Apple).
 *  - GET   ?token=… → désabo + redirection vers la page de confirmation.
 * Idempotent (un token déjà désabonné ne plante pas).
 */
const SITE = 'https://laplaceduvillage.app'

async function unsubscribe(token: string): Promise<void> {
  if (!token) return
  await supabaseAdmin.from('profiles').update({ newsletter_optin: false }).eq('newsletter_token', token)
  await supabaseAdmin.from('newsletter_extra_emails').delete().eq('token', token)
}

export async function POST(req: NextRequest) {
  await unsubscribe(new URL(req.url).searchParams.get('token') ?? '')
  return NextResponse.json({ success: true })
}

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('token') ?? ''
  await unsubscribe(token)
  return NextResponse.redirect(`${SITE}/newsletter?token=${token}&a=unsubscribe`)
}
