import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { notifyUsers } from '@/lib/server-auth'

export const runtime = 'nodejs'
export const maxDuration = 60

/** Doit rester aligné sur la contrainte CHECK de event_favorites.rappel_jours. */
const MAX_RAPPEL_JOURS = 7
/** Sentinelle « 2 h avant » — le seul réglage qui ne s'exprime pas en jours. */
const RAPPEL_2H = -1
/** Heure de Paris à laquelle partent les rappels exprimés en jours. */
const HEURE_ENVOI_PARIS = 10

/**
 * Cron Vercel — rappel des événements mis en favori.
 *
 * Tourne TOUTES LES HEURES et prévient chaque habitant des événements qu'il a
 * mis en favori, au délai qu'il a choisi (`event_favorites.rappel_jours`).
 *
 * Deux régimes :
 *  - réglage en jours (1 = la veille, jusqu'à 7) → part une fois par jour, au
 *    passage de 10 h à Paris ;
 *  - réglage « 2 h avant » (-1) → part dans l'heure qui précède de deux heures
 *    le début de l'événement. C'est pour lui que le cron tourne à l'heure.
 *    Sans horaire connu sur l'événement, on retombe sur l'envoi de 10 h le
 *    jour même — mieux vaut prévenir le matin que pas du tout.
 *
 * Tout est comparé en heure de Paris : les horaires des événements sont des
 * heures locales, et le serveur Vercel est en UTC.
 *
 * Sécurité : même garde que les autres crons (CRON_SECRET si défini, sinon
 * user-agent vercel-cron).
 */

/** Date du jour au format YYYY-MM-DD, à Paris — le serveur Vercel est en UTC. */
function parisDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

/** Heure courante à Paris (0-23). */
function parisHeure(): number {
  return Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris', hour: '2-digit', hour12: false,
  }).format(new Date()))
}

/**
 * Quand tombe un rappel « 2 h avant », exprimé en heure locale de Paris.
 * Renvoie null si l'événement n'a pas d'horaire connu.
 *
 * Tout se calcule sur l'horloge murale : les horaires stockés SONT des heures
 * de Paris, donc aucune conversion de fuseau n'est nécessaire — il suffit de
 * reculer de 120 minutes, quitte à basculer la veille pour un événement du
 * tout début de journée.
 */
function rappel2h(dateDebut: string, heure: string | null): { date: string; heure: number } | null {
  if (!heure) return null
  const [hh, mm] = heure.split(':').map(Number)
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  const minutes = hh * 60 + mm - 120
  if (minutes >= 0) return { date: dateDebut, heure: Math.floor(minutes / 60) }
  // Événement avant 2 h du matin : le rappel tombe la veille au soir.
  const veille = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(Date.parse(`${dateDebut}T12:00:00Z`) - 86_400_000))
  return { date: veille, heure: Math.floor((minutes + 1440) / 60) }
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const ua = req.headers.get('user-agent') ?? ''
  const secret = process.env.CRON_SECRET
  const isAuthorized = secret
    ? auth === `Bearer ${secret}`
    : ua.toLowerCase().includes('vercel-cron')
  if (!isAuthorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const aujourdhui = parisDate(0)
  // Le délai maximum réglable est de 7 jours : au-delà, rien ne peut être dû
  // aujourd'hui. On borne la fenêtre pour ne pas balayer tout l'agenda.
  const horizon = parisDate(MAX_RAPPEL_JOURS)

  // Deux requêtes séparées plutôt qu'une jointure PostgREST : les jointures
  // implicites échouent silencieusement sur ce projet (piège documenté).
  const { data: events, error: evErr } = await supabaseAdmin
    .from('evenements')
    .select('id, titre, date_debut, heure')
    .eq('statut', 'publie')
    .gte('date_debut', aujourdhui)
    .lte('date_debut', horizon)
  if (evErr) return NextResponse.json({ error: evErr.message }, { status: 500 })
  if (!events?.length) return NextResponse.json({ date: aujourdhui, events: 0, sent: 0 })

  const eventIds = events.map(e => e.id)
  const { data: favs, error: favErr } = await supabaseAdmin
    .from('event_favorites')
    // select('*') : si la migration rappel_jours n'est pas encore jouée, le
    // cron continue de tourner et retombe sur le comportement d'origine (veille).
    .select('*')
    .in('event_id', eventIds)
  if (favErr) return NextResponse.json({ error: favErr.message }, { status: 500 })
  if (!favs?.length) return NextResponse.json({ date: aujourdhui, events: events.length, sent: 0 })

  /** Jours entre aujourd'hui et la date de l'événement, en jours calendaires. */
  const joursAvant = (dateDebut: string) => Math.round(
    (Date.parse(`${dateDebut}T12:00:00Z`) - Date.parse(`${aujourdhui}T12:00:00Z`)) / 86_400_000,
  )

  // Anti-doublon sans migration : la table `notifications` fait déjà foi.
  // Si un rappel existe pour ce couple (user, événement), on ne le refait pas —
  // un second passage du cron dans la journée ne peut donc rien renvoyer.
  const { data: dejaEnvoyes } = await supabaseAdmin
    .from('notifications')
    .select('user_id, target_id')
    .eq('type', 'event_rappel')
    .in('target_id', eventIds)
  const deja = new Set((dejaEnvoyes ?? []).map(n => `${n.user_id}:${n.target_id}`))

  const heureCourante = parisHeure()
  const heureDenvoi = heureCourante === HEURE_ENVOI_PARIS

  let sent = 0
  for (const evt of events) {
    const dans = joursAvant(evt.date_debut)
    const deuxHeures = rappel2h(evt.date_debut, evt.heure ?? null)
    const destinataires = favs
      .filter(f => {
        if (f.event_id !== evt.id) return false
        if (deja.has(`${f.user_id}:${evt.id}`)) return false
        const reglage = f.rappel_jours ?? 1
        if (reglage === RAPPEL_2H) {
          // Sans horaire connu, on retombe sur l'envoi du matin, le jour même.
          if (!deuxHeures) return heureDenvoi && dans === 0
          return deuxHeures.date === aujourdhui && deuxHeures.heure === heureCourante
        }
        // Réglages en jours : une seule fenêtre d'envoi par jour.
        return heureDenvoi && reglage === dans
      })
      .map(f => f.user_id)
    if (!destinataires.length) continue
    // notifyUsers insère les notifications ET pousse le web push. Fail-safe :
    // un envoi raté ne doit pas interrompre les autres événements du jour.
    await notifyUsers(destinataires, {
      type:        'event_rappel',
      actor_name:  evt.titre,
      target_type: 'event',
      target_id:   evt.id,
    }).catch(() => {})
    sent += destinataires.length
  }

  return NextResponse.json({ date: aujourdhui, heure: heureCourante, events: events.length, sent })
}
