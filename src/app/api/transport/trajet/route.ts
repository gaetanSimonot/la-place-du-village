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

interface Passage { trip_id: string; ordre: number; depart: string | null; arrivee: string | null; stop_id: string }

export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams
  // Plusieurs arrets separes par des virgules : une commune, c'est plusieurs
  // arrets (Ganges en a 4, Saint-Gely-du-Fesc 18). On cherche sur tous, et
  // c'est le resultat qui dit lequel est effectivement emprunte.
  const listeDe = (p.get('de') ?? '').split(',').map(x => x.trim()).filter(Boolean)
  const listeVers = (p.get('vers') ?? '').split(',').map(x => x.trim()).filter(Boolean)
  const de = listeDe[0] ?? ''
  const vers = listeVers[0] ?? ''
  const date = (p.get('date') ?? '').trim()
  const heure = (p.get('heure') ?? '00:00').trim()

  if (!de || !vers) return NextResponse.json({ error: 'Départ et arrivée requis' }, { status: 400 })
  if (listeDe.some(x => listeVers.includes(x))) {
    return NextResponse.json({ error: 'Le départ et l’arrivée sont au même endroit' }, { status: 400 })
  }
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
  for (const [arrets, cible] of [[listeDe, passagesDe], [listeVers, passagesVers]] as [string[], Map<string, Passage>][]) {
    const { data } = await supabaseAdmin
      .from('transport_passages')
      .select('trip_id, ordre, depart, arrivee, stop_id')
      .in('stop_id', arrets)
    for (const x of data ?? []) {
      const trip = x.trip_id as string
      if (!courses.has(trip)) continue
      // Une course peut toucher deux arrets de la meme commune. Pour le
      // depart on garde le PREMIER rencontre, pour l'arrivee le DERNIER :
      // c'est ce qui donne le trajet le plus long a l'interieur de la ville,
      // donc celui qui dessert le plus de monde.
      const dejaLa = cible.get(trip)
      if (!dejaLa) { cible.set(trip, x as unknown as Passage); continue }
      const garderLePlusPetit = cible === passagesDe
      if (garderLePlusPetit ? (x.ordre as number) < dejaLa.ordre : (x.ordre as number) > dejaLa.ordre) {
        cible.set(trip, x as unknown as Passage)
      }
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
      // Quel arret est REELLEMENT emprunte : la recherche part d'une commune,
      // la reponse doit dire ou l'on monte et ou l'on descend.
      arret_depart: d.stop_id,
      arret_arrivee: a.stop_id,
    })
  }

  // Tri par heure de depart. On garde en tete de liste le plus tot, qui est
  // ce qu'on cherche quand on demande « a partir de 7h ». Le plus RAPIDE est
  // signale a part : entre deux bus a la meme heure, la duree tranche.
  trajets.sort((x, y) => x.depart.localeCompare(y.depart) || x.duree_min - y.duree_min)
  const retenus = trajets.slice(0, 12)
  const plusRapide = retenus.reduce<number | null>(
    (best, t, i) => (best === null || t.duree_min < retenus[best].duree_min ? i : best), null,
  )

  // Les noms des arrets empruntes, pour l'affichage.
  const idsUtiles = Array.from(new Set(retenus.flatMap(t => [t.arret_depart, t.arret_arrivee])))
  const { data: noms } = idsUtiles.length
    ? await supabaseAdmin.from('transport_arrets').select('stop_id, nom, lat, lng').in('stop_id', idsUtiles)
    : { data: [] }

  return NextResponse.json({
    date,
    apres: heure,
    trajets: retenus,
    plus_rapide: plusRapide,
    arrets: noms ?? [],
    source: 'Réseau liO — Région Occitanie, via transport.data.gouv.fr (ODbL)',
  })
}

/** « 25:10:00 » → 1510. Les heures au-delà de 24 sont légales en GTFS. */
function minutes(h: string): number {
  const [hh, mm] = h.split(':')
  return Number(hh) * 60 + Number(mm)
}
