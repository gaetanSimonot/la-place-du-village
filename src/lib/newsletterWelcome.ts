/**
 * L'ÉDITION EN COURS — la lettre qui part, et tout ce qui la sert.
 *
 * Elle porte les SECTIONS, pas du HTML figé, et c'est le point décisif : le
 * corps est rendu au moment de CHAQUE lot. Modifier la lettre entre deux
 * lots change donc ce que recevront ceux qui n'ont pas encore été servis.
 * Avant, le HTML était figé au premier envoi : on pouvait retoucher pendant
 * quatre jours sans qu'un seul destinataire en voie la couleur.
 *
 * `sentAt` ne bouge PAS quand on met le contenu à jour. C'est la date de la
 * CAMPAGNE, celle qui dit qui a déjà reçu : la décaler renverrait la lettre
 * à tout le monde, y compris aux deux cents personnes déjà servies.
 *
 * Les éditions de l'ancien format ne portent qu'un `body` : on continue de
 * l'envoyer tel quel. Une campagne en cours ne doit pas se casser sur un
 * déploiement.
 */
import { supabaseAdmin } from '@/lib/supabase-admin'
import { wrapNewsletter, MARQUE_PRENOM, renderNewsletterBody } from '@/lib/newsletterRender'
import { sendEmail, arreterLaFile } from '@/lib/email'
import type { NewsletterBlock } from '@/lib/newsletterBlocks'

const SITE = 'https://laplaceduvillage.app'
const KEY = 'newsletter_current'

/** Plafond d'envois par passage (Resend gratuit = 100/jour ; on garde du mou
 *  pour les abonnements instantanés). Le cron quotidien draine le reste. */
export const DAILY_LIMIT = 90

export interface CurrentEdition {
  subject: string
  /** Les sections. Rendues à chaque lot — c'est la source de vérité. */
  blocks?: NewsletterBlock[]
  /** Territoire de rendu (les contenus en dépendent). */
  terr?: string | null
  /** Ancien format : HTML déjà rendu. Repli pour les campagnes en cours. */
  body?: string
  /** Début de campagne. Ne bouge pas quand on met le contenu à jour. */
  sentAt: string
  /** Dernière mise à jour du contenu. */
  majAt?: string
}

export async function getCurrentEdition(): Promise<CurrentEdition | null> {
  const { data } = await supabaseAdmin.from('config').select('value').eq('key', KEY).maybeSingle()
  try { return data?.value ? JSON.parse(data.value) as CurrentEdition : null } catch { return null }
}

/**
 * Le corps à envoyer, rendu MAINTENANT.
 *
 * Une fois par lot, pas une fois par destinataire : le rendu interroge la
 * base (événements, promos, commerces) et cent destinataires ne doivent pas
 * produire cent fois les mêmes requêtes.
 */
export async function corpsDeLEdition(ed: CurrentEdition): Promise<string | null> {
  if (ed.blocks?.length) return renderNewsletterBody(ed.blocks, ed.terr ?? null)
  return ed.body ?? null
}

/** Ouvre une campagne : nouvelle date de départ, donc tout le monde à servir. */
export async function setCurrentEdition(
  subject: string, blocks: NewsletterBlock[], terr: string | null = null,
): Promise<void> {
  const value = JSON.stringify({ subject, blocks, terr, sentAt: new Date().toISOString() })
  await supabaseAdmin.from('config').upsert({ key: KEY, value }, { onConflict: 'key' })
}

/**
 * Met à jour le CONTENU de la campagne en cours, sans y toucher autrement.
 *
 * `sentAt` est reporté tel quel : ceux qui ont déjà reçu ne sont pas
 * resservis, ceux qui attendent recevront cette version-ci. C'est toute la
 * différence avec un second envoi.
 *
 * Sans campagne ouverte, il n'y a rien à mettre à jour : on le dit plutôt que
 * d'en ouvrir une en douce, ce qui enverrait la lettre à tout le monde.
 */
export async function majEditionEnCours(
  subject: string, blocks: NewsletterBlock[], terr: string | null = null,
): Promise<{ ok: boolean; raison?: string }> {
  const ed = await getCurrentEdition()
  if (!ed) return { ok: false, raison: 'aucune édition en cours' }
  const value = JSON.stringify({
    subject, blocks, terr,
    sentAt: ed.sentAt,                    // LA date de campagne, intouchée
    majAt: new Date().toISOString(),
  })
  await supabaseAdmin.from('config').upsert({ key: KEY, value }, { onConflict: 'key' })
  return { ok: true }
}

/**
 * Le prénom, tiré du nom affiché.
 *
 * Premier mot seulement : « Gaëtan Simonot » donne « Gaëtan ». On écarte ce
 * qui ne ressemble pas à un prénom — une adresse, un nom d'enseigne à rallonge,
 * du vide — plutôt que d'écrire « Bonjour contact@… ».
 */
function prenomDe(nom: string | null | undefined): string {
  const p = String(nom ?? '').trim().split(/\s+/)[0] ?? ''
  if (!p || p.length > 20 || p.includes('@')) return ''
  return p
}

/**
 * Personnalise le corps figé pour UN destinataire.
 *
 * Le corps de l'édition est rendu une seule fois puis envoyé à tout le monde :
 * le prénom ne peut donc pas y être écrit au rendu. Il y a une marque, qu'on
 * remplace ici — au même endroit et au même moment que le jeton de
 * désabonnement. Sans prénom connu, la marque disparaît et la phrase se lit
 * « Bonjour, », ce qui reste correct.
 */
function personnaliser(body: string, nom: string | null | undefined): string {
  const p = prenomDe(nom)
  return body.split(MARQUE_PRENOM).join(p ? ` ${p}` : '')
}

function editionHtml(body: string, token: string, nom?: string | null): string {
  const unsub = `${SITE}/newsletter?token=${token}&a=unsubscribe`
  return wrapNewsletter(
    personnaliser(body, nom),
    `Tu reçois cet email car tu es abonné·e à la newsletter de La Place du Village.<br/><a href="${unsub}" style="color:#6B5C4C;text-decoration:underline">Se désabonner en un clic</a><br/>La Place du Village — 34190 Ganges, Hérault, France`,
  )
}

/** En-têtes RFC 8058 : désabonnement « 1 clic » natif (Gmail/Outlook/Apple). */
function unsubHeaders(token: string): Record<string, string> {
  const url = `${SITE}/api/newsletter/unsubscribe?token=${token}`
  return {
    'List-Unsubscribe': `<${url}>, <mailto:lettre@laplaceduvillage.app?subject=unsubscribe>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
}

const needsSend = (welcomedAt: string | null | undefined, sentAt: string) => !welcomedAt || welcomedAt < sentAt

/** Envoie l'édition active à un profil s'il ne l'a pas déjà reçue. */
export async function welcomeProfile(userId: string): Promise<void> {
  const ed = await getCurrentEdition()
  if (!ed) return
  const { data } = await supabaseAdmin.from('profiles').select('email, display_name, newsletter_token, newsletter_welcomed_at').eq('user_id', userId).maybeSingle()
  if (!data?.email) return
  if (!needsSend(data.newsletter_welcomed_at as string | null, ed.sentAt)) return
  const corps = await corpsDeLEdition(ed)
  if (!corps) return
  const r = await sendEmail({ to: data.email as string, subject: ed.subject, html: editionHtml(corps, String(data.newsletter_token), data.display_name as string | null), headers: unsubHeaders(String(data.newsletter_token)) })
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
  const corps = await corpsDeLEdition(ed)
  if (!corps) return
  const r = await sendEmail({ to: email, subject: ed.subject, html: editionHtml(corps, String(data.token)), headers: unsubHeaders(String(data.token)) })
  if (!r.ok) return   // échec (ex. quota) → on ne marque PAS → le cron réessaiera
  await supabaseAdmin.from('newsletter_extra_emails').update({ welcomed_at: new Date().toISOString() }).eq('email', email)
}

export interface ResultatLot {
  /** Partis pour de bon. */
  envoyes: number
  /** Adresses refusées une par une : on est passé au suivant. */
  ignores: number
  /** La file s'est arrêtée (quota, panne) — le prochain passage reprendra. */
  arrete: boolean
}

/**
 * Rattrapage : envoie l'édition en cours à ceux qui ne l'ont pas reçue.
 *
 * Une adresse refusée ne bloque plus la file : on la compte et on continue.
 * Le quota ou une panne, eux, arrêtent tout — il n'y a rien à gagner à
 * marteler un service qui dit non, et le passage suivant reprendra où on en
 * est, puisque c'est la base qui dit qui a reçu.
 */
export async function welcomeBacklog(limit = DAILY_LIMIT): Promise<ResultatLot> {
  const ed = await getCurrentEdition()
  if (!ed) return { envoyes: 0, ignores: 0, arrete: false }
  // UNE fois pour tout le lot : le rendu interroge la base, on ne le refait
  // pas quatre-vingt-dix fois. La personnalisation, elle, est par personne.
  const corps = await corpsDeLEdition(ed)
  if (!corps) return { envoyes: 0, ignores: 0, arrete: false }
  let sent = 0
  let ignores = 0

  const { data: profs } = await supabaseAdmin
    .from('profiles').select('user_id, email, display_name, newsletter_token, newsletter_welcomed_at')
    .eq('newsletter_optin', true).not('email', 'is', null)
    .or(`newsletter_welcomed_at.is.null,newsletter_welcomed_at.lt.${ed.sentAt}`)
    .limit(limit)
  for (const p of profs ?? []) {
    const r = await sendEmail({ to: p.email as string, subject: ed.subject, html: editionHtml(corps, String(p.newsletter_token), p.display_name as string | null), headers: unsubHeaders(String(p.newsletter_token)) })
    if (!r.ok) {
      if (arreterLaFile(r.statut)) return { envoyes: sent, ignores, arrete: true }
      ignores++            // adresse refusée : au suivant, la file continue
      continue
    }
    await supabaseAdmin.from('profiles').update({ newsletter_welcomed_at: new Date().toISOString() }).eq('user_id', p.user_id)
    sent++
  }

  const { data: extras } = await supabaseAdmin
    .from('newsletter_extra_emails').select('email, token, welcomed_at')
    .or(`welcomed_at.is.null,welcomed_at.lt.${ed.sentAt}`)
    .limit(limit)
  for (const x of extras ?? []) {
    const r = await sendEmail({ to: x.email as string, subject: ed.subject, html: editionHtml(corps, String(x.token)), headers: unsubHeaders(String(x.token)) })
    if (!r.ok) {
      if (arreterLaFile(r.statut)) return { envoyes: sent, ignores, arrete: true }
      ignores++
      continue
    }
    await supabaseAdmin.from('newsletter_extra_emails').update({ welcomed_at: new Date().toISOString() }).eq('email', x.email)
    sent++
  }
  return { envoyes: sent, ignores, arrete: false }
}
