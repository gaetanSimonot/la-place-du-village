import { supabaseAdmin } from './supabase-admin'

/**
 * La recherche de trajets en car, au meme endroit pour tout le monde.
 *
 * L'API de la carte et l'assistant vocal posent la MEME question ; s'ils
 * avaient chacun leur code, ils finiraient par repondre differemment sur le
 * meme trajet. Ici il n'y a qu'une verite.
 *
 * SANS CORRESPONDANCE, a dessein : on cherche les courses qui passent par les
 * DEUX arrets, le depart avant l'arrivee. Un trajet avec changement de ligne
 * est un autre metier — un moteur d'itineraire.
 *
 * LE PIEGE DES CALENDRIERS : une course ne roule pas tous les jours. Le GTFS
 * dit d'abord quels jours de semaine (calendar), puis corrige au cas par cas
 * (calendar_dates : un ferie qui supprime, un renfort qui ajoute).
 * L'exception l'emporte TOUJOURS sur la regle — sinon on annonce des bus
 * fantomes le 1er mai.
 *
 * LES HEURES APRES MINUIT : le GTFS ecrit « 25:10:00 » pour 1h10 rattache au
 * service de la veille. Comparer des chaines « HH:MM:SS » range donc
 * correctement un bus de 25:10 apres un de 23:40.
 */

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'] as const

interface Passage {
  trip_id: string
  ordre: number
  depart: string | null
  arrivee: string | null
  stop_id: string
}

export interface Trajet {
  trip_id: string
  route_id: string
  destination: string | null
  depart: string
  arrivee: string
  duree_min: number
  arrets_intermediaires: number
  arret_depart: string
  arret_arrivee: string
}

export interface ResultatTrajets {
  date: string
  apres: string
  trajets: Trajet[]
  plus_rapide: number | null
  arrets: { stop_id: string; nom: string; lat: number; lng: number }[]
  raison?: string
}

/** Sans accents ni casse — « gely » doit trouver « GÉLY ». */
export function sansAccent(s: string): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/** La commune d'un arret : ce qui precede le premier tiret. */
export function communeDe(nom: string): string {
  return nom.split(' - ')[0].trim()
}

/** « 25:10:00 » → 1510. Les heures au-dela de 24 sont legales en GTFS. */
export function minutes(h: string): number {
  const [hh, mm] = h.split(':')
  return Number(hh) * 60 + Number(mm)
}

/** Toutes les communes desservies, une fois chacune. */
export async function communesDesservies(): Promise<string[]> {
  const { data } = await supabaseAdmin.from('transport_arrets').select('nom')
  const vues = new Set<string>()
  for (const a of data ?? []) vues.add(communeDe(a.nom as string))
  return Array.from(vues).sort((a, b) => a.localeCompare(b, 'fr'))
}

/**
 * Retrouve une commune a partir d'un texte parle ou tape.
 *
 * On accepte l'a-peu-pres : « montpelier », « st hippolyte », « le vigan ».
 * Egalite exacte d'abord, puis inclusion — dans un sens comme dans l'autre,
 * parce qu'on dit « Saint-Hippolyte » pour « SAINT-HIPPOLYTE DU FORT ».
 */
export async function resoudreCommune(texte: string): Promise<{ commune: string | null; candidates: string[] }> {
  const q = sansAccent(texte).replace(/^(a|au|de|du|vers|pour|jusqu.a)\s+/i, '')
  if (!q) return { commune: null, candidates: [] }
  const toutes = await communesDesservies()

  const exact = toutes.find(c => sansAccent(c) === q)
  if (exact) return { commune: exact, candidates: [] }

  const proches = toutes.filter(c => {
    const n = sansAccent(c)
    return n.includes(q) || q.includes(n)
  })
  if (proches.length === 1) return { commune: proches[0], candidates: [] }
  return { commune: null, candidates: proches.length > 0 ? proches : toutes }
}

/** Les identifiants d'arret d'une commune. */
export async function arretsDeCommune(commune: string): Promise<string[]> {
  const { data } = await supabaseAdmin.from('transport_arrets').select('stop_id, nom')
  return (data ?? [])
    .filter(a => sansAccent(communeDe(a.nom as string)) === sansAccent(commune))
    .map(a => a.stop_id as string)
}

/**
 * Les prochains cars entre deux ensembles d'arrets.
 *
 * `de` et `vers` sont des LISTES : une commune, c'est plusieurs arrets, et
 * le GTFS decrit meme les deux cotes de la route comme deux arrets distincts.
 */
export async function chercherTrajets(
  de: string[], vers: string[], date: string, heure: string, plafond = 12,
): Promise<ResultatTrajets> {
  const vide: ResultatTrajets = { date, apres: heure, trajets: [], plus_rapide: null, arrets: [] }

  // ── 1. Quels services roulent ce jour-la ? ────────────────────────────
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

  if (actifs.size === 0) return { ...vide, raison: 'Aucun car ne circule ce jour-là.' }

  // ── 2. Les courses qui roulent ────────────────────────────────────────
  const listeActifs = Array.from(actifs)
  const courses = new Map<string, { route_id: string; destination: string | null }>()
  for (let i = 0; i < listeActifs.length; i += 100) {
    const { data } = await supabaseAdmin
      .from('transport_courses')
      .select('trip_id, route_id, destination')
      .in('service_id', listeActifs.slice(i, i + 100))
    for (const c of data ?? []) {
      courses.set(c.trip_id as string, {
        route_id: c.route_id as string,
        destination: c.destination as string | null,
      })
    }
  }
  if (courses.size === 0) return vide

  // ── 3. Les passages aux deux extremites ───────────────────────────────
  const passagesDe = new Map<string, Passage>()
  const passagesVers = new Map<string, Passage>()
  for (const [arrets, cible] of [[de, passagesDe], [vers, passagesVers]] as [string[], Map<string, Passage>][]) {
    for (let i = 0; i < arrets.length; i += 100) {
      const { data } = await supabaseAdmin
        .from('transport_passages')
        .select('trip_id, ordre, depart, arrivee, stop_id')
        .in('stop_id', arrets.slice(i, i + 100))
      for (const x of data ?? []) {
        const trip = x.trip_id as string
        if (!courses.has(trip)) continue
        // Une course peut toucher deux arrets de la meme commune. Pour le
        // depart on garde le PREMIER rencontre, pour l'arrivee le DERNIER :
        // c'est le trajet le plus long dans la ville, celui qui dessert le
        // plus de monde.
        const dejaLa = cible.get(trip)
        if (!dejaLa) { cible.set(trip, x as unknown as Passage); continue }
        const garderLePlusPetit = cible === passagesDe
        if (garderLePlusPetit ? (x.ordre as number) < dejaLa.ordre : (x.ordre as number) > dejaLa.ordre) {
          cible.set(trip, x as unknown as Passage)
        }
      }
    }
  }

  // ── 4. Croisement : meme course, depart AVANT arrivee ─────────────────
  const hhmmss = `${heure}:00`
  const trajets: Trajet[] = []
  for (const [tripId, d] of Array.from(passagesDe.entries())) {
    const a = passagesVers.get(tripId)
    if (!a) continue
    // C'est ce test qui donne le SENS : si l'arret d'arrivee vient avant
    // celui de depart sur cette course, le car va dans l'autre sens.
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
      arret_depart: d.stop_id,
      arret_arrivee: a.stop_id,
    })
  }

  trajets.sort((x, y) => x.depart.localeCompare(y.depart) || x.duree_min - y.duree_min)
  const retenus = trajets.slice(0, plafond)
  const plusRapide = retenus.reduce<number | null>(
    (best, t, i) => (best === null || t.duree_min < retenus[best].duree_min ? i : best), null,
  )

  const idsUtiles = Array.from(new Set(retenus.flatMap(t => [t.arret_depart, t.arret_arrivee])))
  const { data: noms } = idsUtiles.length
    ? await supabaseAdmin.from('transport_arrets').select('stop_id, nom, lat, lng').in('stop_id', idsUtiles)
    : { data: [] }

  return {
    date,
    apres: heure,
    trajets: retenus,
    plus_rapide: plusRapide,
    arrets: (noms ?? []) as ResultatTrajets['arrets'],
  }
}
