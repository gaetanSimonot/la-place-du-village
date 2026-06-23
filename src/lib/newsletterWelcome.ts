/**
 * « Édition active » de la newsletter + envoi automatique aux nouveaux abonnés.
 *
 * Quand l'admin envoie aux abonnés, on mémorise l'édition (sujet + corps HTML +
 * date) dans config('newsletter_current') et on marque tous les abonnés du
 * moment comme l'ayant reçue. Tout nouvel abonné (welcomed_at NULL ou antérieur
 * à la date de l'édition) reçoit automatiquement cette édition, une seule fois.
 */
import { supabaseAdmin } from '@/lib/supabase-admin'
import { wrapNewsletter } from '@/lib/newsletterRender'
import { sendEmail } from '@/lib/email'

const SITE = 'https://laplaceduvillage.app'
const KEY = 'newsletter_current'

/** Plafond d'envois par passage (Resend gratuit = 100/jour ; on garde du mou
 *  pour les abonnements instantanés). Le cron quotidien draine le reste. */
export const DAILY_LIMIT = 90

export interface CurrentEdition { subject: string; body: string; sentAt: string }

export async function getCurrentEdition(): Promise<CurrentEdition | null> {
  const { data } = await supabaseAdmin.from('config').select('value').eq('key', KEY).maybeSingle()
  try { return data?.value ? JSON.parse(data.value) as CurrentEdition : null } catch { return null }
}

export async function setCurrentEdition(subject: string, body: string): Promise<void> {
  const value = JSON.stringify({ subject, body, sentAt: new Date().toISOString() })
  await supabaseAdmin.from('config').upsert({ key: KEY, value }, { onConflict: 'key' })
}

function editionHtml(body: string, token: string): string {
  const unsub = `${SITE}/newsletter?token=${token}&a=unsubscribe`
  return wrapNewsletter(body, `Tu reçois cet email car tu es abonné·e à la newsletter de La Place du Village.<br/><a href="${unsub}" style="color:#9A8A7A">Se désabonner en un clic</a>`)
}

const needsSend = (welcomedAt: string | null | undefined, sentAt: string) => !welcomedAt || welcomedAt < sentAt

/** Envoie l'édition active à un profil s'il ne l'a pas déjà reçue. */
export async function welcomeProfile(userId: string): Promise<void> {
  const ed = await getCurrentEdition()
  if (!ed) return
  const { data } = await supabaseAdmin.from('profiles').select('email, newsletter_token, newsletter_welcomed_at').eq('user_id', userId).maybeSingle()
  if (!data?.email) return
  if (!needsSend(data.newsletter_welcomed_at as string | null, ed.sentAt)) return
  const r = await sendEmail({ to: data.email as string, subject: ed.subject, html: editionHtml(ed.body, String(data.newsletter_token)) })
  if (!r.ok) return   // échec (ex. quota) → on ne marque PAS → le cron réessaiera
  await supabaseAdmin.from('profiles').update({ newsletter_welcomed_at: new Date().toISOString() }).eq('user_id', userId)
}

/** Envoie l'édition active à un email externe (ajouté à la main). */
export async function welcomeExtra(email: string): Promise<void> {
  const ed = await getCurrentEdition()
  if (!ed) return
  const { data } = await supabaseAdmin.from('newsletter_extra_emails').select('token, welcomed_at').eq('email', email).maybeSingle()
  if (!data) return
  if (!needsSend(data.welcomed_at as string | null, ed.sentAt)) return
  const r = await sendEmail({ to: email, subject: ed.subject, html: editionHtml(ed.body, String(data.token)) })
  if (!r.ok) return   // échec (ex. quota) → on ne marque PAS → le cron réessaiera
  await supabaseAdmin.from('newsletter_extra_emails').update({ welcomed_at: new Date().toISOString() }).eq('email', email)
}

/** Rattrapage (cron) : envoie l'édition active à tous les abonnés en retard. */
export async function welcomeBacklog(limit = DAILY_LIMIT): Promise<number> {
  const ed = await getCurrentEdition()
  if (!ed) return 0
  let sent = 0

  const { data: profs } = await supabaseAdmin
    .from('profiles').select('user_id, email, newsletter_token, newsletter_welcomed_at')
    .eq('newsletter_optin', true).not('email', 'is', null)
    .or(`newsletter_welcomed_at.is.null,newsletter_welcomed_at.lt.${ed.sentAt}`)
    .limit(limit)
  for (const p of profs ?? []) {
    const r = await sendEmail({ to: p.email as string, subject: ed.subject, html: editionHtml(ed.body, String(p.newsletter_token)) })
    if (!r.ok) return sent   // quota/erreur → on s'arrête, le prochain cron reprendra
    await supabaseAdmin.from('profiles').update({ newsletter_welcomed_at: new Date().toISOString() }).eq('user_id', p.user_id)
    sent++
  }

  const { data: extras } = await supabaseAdmin
    .from('newsletter_extra_emails').select('email, token, welcomed_at')
    .or(`welcomed_at.is.null,welcomed_at.lt.${ed.sentAt}`)
    .limit(limit)
  for (const x of extras ?? []) {
    const r = await sendEmail({ to: x.email as string, subject: ed.subject, html: editionHtml(ed.body, String(x.token)) })
    if (!r.ok) return sent
    await supabaseAdmin.from('newsletter_extra_emails').update({ welcomed_at: new Date().toISOString() }).eq('email', x.email)
    sent++
  }
  return sent
}
