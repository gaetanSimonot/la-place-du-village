import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { monterLettreDeLaSemaine } from '@/lib/newsletterAuto'
import { territoireParDefaut } from '@/lib/territoires'

/*
 * Le cron relit le brouillon regle dans l'editeur : il doit voir la DERNIERE
 * version, pas celle qu'un cache a retenue. Une lettre partie sur un vieux
 * brouillon ne se rattrape pas.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'
import { renderNewsletterBody } from '@/lib/newsletterRender'
import { setCurrentEdition, welcomeBacklog, DAILY_LIMIT } from '@/lib/newsletterWelcome'
import type { NewsletterBlock } from '@/lib/newsletterBlocks'
import { semaineDe } from '@/lib/semaine'

/**
 * LA LETTRE DU LUNDI — montée et mise en file toute seule.
 *
 * L'autre cron, `newsletter-welcome`, ne fait que VIDER la file : il n'a
 * jamais créé d'édition. C'est pour ça que seize numéros ont été écrits sans
 * qu'aucun ne parte, et que l'édition servie aux nouveaux inscrits datait de
 * six semaines.
 *
 * Celui-ci crée l'édition de la semaine, la pose, et envoie le premier lot.
 * Le cron quotidien draine le reste au rythme du quota Resend.
 *
 * INTERRUPTEUR : `config('newsletter_auto')`. À 'false', ce cron ne fait rien
 * — l'envoi redevient entièrement manuel. C'est un réglage, pas un
 * commentaire à modifier.
 *
 * Il ne peut pas envoyer deux fois la même semaine : `newsletter_auto_last`
 * retient le lundi déjà traité. Un rejeu du cron, un déploiement, un appel à
 * la main ne produisent donc pas de doublon.
 */

export const maxDuration = 300

const CLE_ACTIF = 'newsletter_auto'
const CLE_DERNIER = 'newsletter_auto_last'

async function config(cle: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from('config').select('value').eq('key', cle).maybeSingle()
  return (data?.value as string | undefined) ?? null
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const ua = req.headers.get('user-agent') ?? ''
  const secret = process.env.CRON_SECRET
  const ok = secret ? auth === `Bearer ${secret}` : ua.toLowerCase().includes('vercel-cron')
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Défaut : ACTIF. Il faut dire non explicitement pour que rien ne parte —
  // l'inverse reproduirait la situation qu'on corrige, où le silence gagne.
  if ((await config(CLE_ACTIF)) === 'false') {
    return NextResponse.json({ ok: true, ignore: 'envoi automatique désactivé' })
  }

  const sem = semaineDe()
  if ((await config(CLE_DERNIER)) === sem.debut) {
    return NextResponse.json({ ok: true, ignore: 'lettre de cette semaine déjà envoyée' })
  }

  // On repart du brouillon réglé dans l'éditeur : ses retouches à la main
  // survivent, seule la partie qui dépend de la semaine est recalculée.
  let base: NewsletterBlock[] | null = null
  let reglages: { fige?: boolean; retires?: string[] } = {}
  try {
    const brut = await config('newsletter_draft')
    const d = brut ? JSON.parse(brut) : null
    base = (d?.blocks as NewsletterBlock[]) ?? null
    // Les mêmes réglages que dans l'éditeur, sans quoi l'aperçu et l'envoi
    // diraient deux choses différentes — et c'est l'envoi qui aurait tort.
    reglages = { fige: !!d?.fige, retires: Array.isArray(d?.retires) ? d.retires : [] }
  } catch { base = null }

  /*
   * La lettre du lundi ne concerne QUE le territoire par defaut, et c'est
   * ecrit ici plutot que subi : les abonnes sont tous la, et un territoire
   * qui ouvre n'a pas encore de semaine a raconter. Le jour ou un autre en
   * veut une, c'est cette ligne qui s'ouvre — une boucle sur les territoires
   * qui l'ont demandee, chacun avec SES abonnes.
   */
  const terr = (await territoireParDefaut())?.id ?? null

  const { subject, blocks } = await monterLettreDeLaSemaine(base, terr, reglages)
  if (!blocks.length) return NextResponse.json({ error: 'aucune section à envoyer' }, { status: 500 })

  const body = await renderNewsletterBody(blocks, terr)
  await setCurrentEdition(subject, body)
  await supabaseAdmin.from('config').upsert({ key: CLE_DERNIER, value: sem.debut }, { onConflict: 'key' })

  const sent = await welcomeBacklog(DAILY_LIMIT)
  return NextResponse.json({ ok: true, semaine: sem.libelle, subject, sent, perDay: DAILY_LIMIT })
}
