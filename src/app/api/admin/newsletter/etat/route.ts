import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/server-auth'
import { getCurrentEdition, DAILY_LIMIT } from '@/lib/newsletterWelcome'
import { semaineDe } from '@/lib/semaine'

/**
 * L'ÉTAT DE L'ENVOI — qui a reçu, qui attend, et quand.
 *
 * Sans cet écran on envoie dans le noir : la file s'étale sur plusieurs jours
 * au rythme du quota Resend, et rien ne disait où elle en était. On voyait
 * « envoyé », puis plus rien pendant trois jours.
 *
 * Le « reste » se calcule comme le cron le calcule — mêmes conditions, même
 * comparaison de dates — pour que le compte affiché soit celui qui partira, et
 * pas une approximation qui diverge.
 */

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const edition = await getCurrentEdition()
  const sem = semaineDe()

  const [{ count: total }, { data: actif }, { data: dernier }] = await Promise.all([
    supabaseAdmin.from('profiles').select('user_id', { count: 'exact', head: true })
      .eq('newsletter_optin', true).not('email', 'is', null),
    supabaseAdmin.from('config').select('value').eq('key', 'newsletter_auto').maybeSingle(),
    supabaseAdmin.from('config').select('value').eq('key', 'newsletter_auto_last').maybeSingle(),
  ])

  // Combien n'ont pas encore reçu l'édition en cours.
  let reste = 0
  if (edition) {
    const { count } = await supabaseAdmin
      .from('profiles').select('user_id', { count: 'exact', head: true })
      .eq('newsletter_optin', true).not('email', 'is', null)
      .or(`newsletter_welcomed_at.is.null,newsletter_welcomed_at.lt.${edition.sentAt}`)
    reste = count ?? 0
  }

  const destinataires = total ?? 0
  return NextResponse.json({
    destinataires,
    recu: Math.max(0, destinataires - reste),
    reste,
    parJour: DAILY_LIMIT,
    joursRestants: Math.ceil(reste / DAILY_LIMIT),
    edition: edition ? { sujet: edition.subject, posee: edition.sentAt } : null,
    // Absent = actif : c'est le défaut du cron, l'écran doit dire la même chose.
    autoActif: (actif?.value as string | undefined) !== 'false',
    semaine: sem.libelle,
    envoyeeCetteSemaine: (dernier?.value as string | undefined) === sem.debut,
  })
}

/** PATCH { autoActif } — l'interrupteur de l'envoi du lundi. */
export async function PATCH(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx
  const { autoActif } = await req.json().catch(() => ({}))
  if (typeof autoActif !== 'boolean') {
    return NextResponse.json({ error: 'autoActif attendu' }, { status: 400 })
  }
  await supabaseAdmin.from('config')
    .upsert({ key: 'newsletter_auto', value: autoActif ? 'true' : 'false' }, { onConflict: 'key' })
  return NextResponse.json({ ok: true, autoActif })
}
