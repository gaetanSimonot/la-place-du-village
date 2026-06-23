import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * POST /api/newsletter/optin — abonnement / désabonnement par jeton (liens des
 * emails). Pas d'authentification : le token (newsletter_token) fait foi.
 * Body : { token: uuid, optin: boolean }
 */
export async function POST(req: NextRequest) {
  const { token, optin } = await req.json().catch(() => ({}))
  if (!token || typeof optin !== 'boolean') {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  }
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ newsletter_optin: optin })
    .eq('newsletter_token', token)
    .select('display_name')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Lien invalide ou expiré' }, { status: 404 })
  return NextResponse.json({ success: true, name: data.display_name ?? null })
}
