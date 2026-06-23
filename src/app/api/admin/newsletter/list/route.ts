import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/server-auth'

/**
 * GET /api/admin/newsletter/list?audience=subscribers|non_subscribers
 * Renvoie les personnes de la liste (nom + email). Pour les abonnés, inclut
 * aussi les emails ajoutés à la main (sans compte).
 */
export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const audience = new URL(req.url).searchParams.get('audience')
  if (audience !== 'subscribers' && audience !== 'non_subscribers') {
    return NextResponse.json({ error: 'audience invalide' }, { status: 400 })
  }
  const optin = audience === 'subscribers'

  const { data: profs } = await supabaseAdmin
    .from('profiles')
    .select('email, display_name')
    .eq('newsletter_optin', optin)
    .not('email', 'is', null)
    .order('display_name', { ascending: true })
    .limit(1000)

  const people: { email: string; name: string | null; extra?: boolean }[] =
    (profs ?? []).map(p => ({ email: p.email as string, name: (p.display_name as string) ?? null }))

  if (optin) {
    const { data: extra } = await supabaseAdmin.from('newsletter_extra_emails').select('email').order('created_at', { ascending: false })
    ;(extra ?? []).forEach(x => people.push({ email: x.email as string, name: null, extra: true }))
  }

  return NextResponse.json({ people })
}
