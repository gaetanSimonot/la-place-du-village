import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const revalidate = 0
export const fetchCache = 'force-no-store'

/**
 * GET /api/transport/trajet?de=<stop_id>&vers=<stop_id>&date=AAAA-MM-JJ&heure=HH:MM
 *
 * Les prochains bus entre deux arrets, un jour donne.
 *
 * SANS CORRESPONDANCE, a dessein : on cherche les courses qui passent par les
 * DEUX arrets, le depart avant l'arrivee. C'est de la lecture de tableau. Un
 * trajet avec changement de ligne est un autre metier — un moteur d'itineraire
 * — et n'a pas de sens tant qu'une seule ligne est importee.
 *
 * LE PIEGE DES CALENDRIERS : une course ne roule pas tous les jours. Le GTFS
 * dit d'abord quels jours de semaine (calendar), puis corrige au cas par cas
 * (calendar_dates : un ferie qui supprime, un renfort qui ajoute). L'exception
 * l'emporte TOUJOURS sur la regle. Sans ca on annonce des bus fantomes le
 * 1er mai.
 *
 * LES HEURES APRES MINUIT : le GTFS ecrit « 25:10:00 » pour 1h10 du matin
 * rattache au service de la veille. Comparer des chaines « HH:MM:SS » range
 * donc correctement un bus de 25:10 apres un de 23:40, ce qu'un vrai type
 * horaire ne saurait pas faire.
 */

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'] as const

interface Passage { trip_id: string; ordre: number; depart: string | null; arrivee: string | null }

export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams
  const de = (p.get('de') ?? '').trim()
  const vers = (p.get('vers') ?? '').trim()
  const date = (p.get('date') ?? '').trim()
  const heure = (p.get('heure') ?? '00:00').trim()

  if (!de || !vers) return NextResponse.json({ error: 'Arrêts de départ et d’arrivée requis' }, { status: 400 })
  if (de === vers) return NextResponse.json({ error: 'Départ et arrivée sont le même arrêt' }, { status: 400 })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'Date attendue au format AAAA-MM-JJ' }, { status: 400 })
  if (!/^\d{2}:\d{2}$/.test(heure)) return NextResponse.json({ error: 'Heure attendue au format HH:MM' }, { status: 400 })

  // ── 1. Quels services roulent ce jour-là ? ────────────────────────────
  // Midi UTC : a minuit, un decalage horaire fait basculer au jour d'avant.
  const jourSemaine = JOURS[new Date(`${date}T12:00:00Z`).getUTCDay()]

  const { data: services } = await supabaseAdmin
    .from('transport_services')
    .select('service_id')
    .lte('debut', date).gte('fin', date)
    .eq(jourSemaine, true)

  const actifs = new Set((services ?? []).map(s => s.service_id as string))

  const { data: exceptions } = await supabaseAdmin
    .from('transport_services_exceptions')
    .select('service_id, ajoute')
    .eq('jour', date)

  // L'exception passe apres la regle, et l'emporte.
  for (const e of exceptions ?? []) {
    if (e.ajoute) actifs.add(e.service_id as string)
    else actifs.delete(e.service_id as string)
  }

  if (actifs.size === 0) {
    return NextResponse.json({ date, trajets: [], raison: 'Aucun service ce jour-là' })
  }

  // ── 2. Les courses qui roulent ────────────────────────────────────────
  const listeActifs = Array.from(actifs)
  const courses = new Map<string, { route_id: string; destination: string | null }>()
  for (let i = 0; i < listeActifs.length; i += 100) {
    const { data } = await supabaseAdmin
      .from('transport_courses')
      .select('trip_id, route_id, destination')
      .in('service_id', listeActifs.slice(i, i + 100))
    for (const c of data ?? []) {
      courses.set(c.trip_id as string, { route_id: c.route_id as string, destination: c.destination as string | null })
    }
  }
  if (courses.size === 0) return NextResponse.json({ date, trajets: [] })

  // ── 3. Les passages aux deux arrêts ───────────────────────────────────
  const passagesDe = new Map<string, Passage>()
  const passagesVers = new Map<string, Passage>()
  for (const [arret, cible] of [[de, passagesDe], [vers, passagesVers]] as [string, Map<string, Passage>][]) {
    const { data } = await supabaseAdmin
      .from('transport_passages')
      .select('trip_id, ordre, depart, arrivee')
      .eq('stop_id', arret)
    for (const x of data ?? []) {
      if (!courses.has(x.trip_id as string)) continue
      cible.set(x.trip_id as string, x as unknown as Passage)
    }
  }

  // ── 4. Croisement : même course, départ AVANT arrivée ─────────────────
  const hhmmss = `${heure}:00`
  const trajets = []
  for (const [tripId, d] of Array.from(passagesDe.entries())) {
    const a = passagesVers.get(tripId)
    if (!a) continue
    // C'est ce test qui donne le SENS : si l'arrêt d'arrivée vient avant
    // celui de départ sur cette course, le bus va dans l'autre sens.
    if (a.ordre <= d.ordre) continue
    const depart = d.depart ?? d.arrivee
    const arrivee = a.arrivee ?? a.depart
    if (!depart || !arrivee) continue
    if (depart < hhmmss) continue
    const c = courses.get(tripId)!
    trajets.push({
      trip_id: tripId,
      route_id: c.route_id,
      destination: c.destination,
      depart,
      arrivee,
      duree_min: minutes(arrivee) - minutes(depart),
      arrets_intermediaires: a.ordre - d.ordre - 1,
    })
  }

  trajets.sort((x, y) => x.depart.localeCompare(y.depart))

  return NextResponse.json({
    date,
    apres: heure,
    trajets: trajets.slice(0, 12),
    source: 'Réseau liO — Région Occitanie, via transport.data.gouv.fr (ODbL)',
  })
}

/** « 25:10:00 » → 1510. Les heures au-delà de 24 sont légales en GTFS. */
function minutes(h: string): number {
  const [hh, mm] = h.split(':')
  return Number(hh) * 60 + Number(mm)
}
