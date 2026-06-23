import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { welcomeProfile } from '@/lib/newsletterWelcome'

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
  // 1) Profil avec compte
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ newsletter_optin: optin })
    .eq('newsletter_token', token)
    .select('user_id, display_name')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (data) {
    if (optin) await welcomeProfile(data.user_id as string).catch(() => {})   // édition active auto
    return NextResponse.json({ success: true, name: data.display_name ?? null })
  }

  // 2) Email externe (ajouté à la main) → le désabonnement = suppression
  const { data: extra } = await supabaseAdmin
    .from('newsletter_extra_emails').select('id').eq('token', token).maybeSingle()
  if (extra) {
    if (!optin) await supabaseAdmin.from('newsletter_extra_emails').delete().eq('id', extra.id)
    return NextResponse.json({ success: true, name: null })
  }

  return NextResponse.json({ error: 'Lien invalide ou expiré' }, { status: 404 })
}
