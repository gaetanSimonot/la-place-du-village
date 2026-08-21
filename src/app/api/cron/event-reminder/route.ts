import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { notifyUsers } from '@/lib/server-auth'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Cron Vercel — rappel des événements mis en favori, la veille.
 *
 * Tourne une fois par jour et prévient chaque habitant des événements qu'il a
 * mis en favori et qui ont lieu DEMAIN. C'est le seul mécanisme de l'app qui
 * ramène quelqu'un à une date précise — et c'est ce qui donne une raison
 * concrète d'activer les notifications.
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

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const ua = req.headers.get('user-agent') ?? ''
  const secret = process.env.CRON_SECRET
  const isAuthorized = secret
    ? auth === `Bearer ${secret}`
    : ua.toLowerCase().includes('vercel-cron')
  if (!isAuthorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const demain = parisDate(1)

  // Deux requêtes séparées plutôt qu'une jointure PostgREST : les jointures
  // implicites échouent silencieusement sur ce projet (piège documenté).
  const { data: events, error: evErr } = await supabaseAdmin
    .from('evenements')
    .select('id, titre')
    .eq('statut', 'publie')
    .eq('date_debut', demain)
  if (evErr) return NextResponse.json({ error: evErr.message }, { status: 500 })
  if (!events?.length) return NextResponse.json({ date: demain, events: 0, sent: 0 })

  const eventIds = events.map(e => e.id)
  const { data: favs, error: favErr } = await supabaseAdmin
    .from('event_favorites')
    .select('user_id, event_id')
    .in('event_id', eventIds)
  if (favErr) return NextResponse.json({ error: favErr.message }, { status: 500 })
  if (!favs?.length) return NextResponse.json({ date: demain, events: events.length, sent: 0 })

  // Anti-doublon sans migration : la table `notifications` fait déjà foi.
  // Si un rappel existe pour ce couple (user, événement), on ne le refait pas —
  // un second passage du cron dans la journée ne peut donc rien renvoyer.
  const { data: dejaEnvoyes } = await supabaseAdmin
    .from('notifications')
    .select('user_id, target_id')
    .eq('type', 'event_rappel')
    .in('target_id', eventIds)
  const deja = new Set((dejaEnvoyes ?? []).map(n => `${n.user_id}:${n.target_id}`))

  let sent = 0
  for (const evt of events) {
    const destinataires = favs
      .filter(f => f.event_id === evt.id && !deja.has(`${f.user_id}:${evt.id}`))
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

  return NextResponse.json({ date: demain, events: events.length, sent })
}
