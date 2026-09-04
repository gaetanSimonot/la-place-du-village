import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const revalidate = 0
export const fetchCache = 'force-no-store'

/**
 * GET /api/transport/troncon?trip=<trip_id>&de=<stop_id>&vers=<stop_id>
 *
 * La portion de route reellement parcourue entre deux arrets d'une course —
 * pour la surligner sur la carte.
 *
 * POURQUOI PAS UNE DROITE ENTRE LES DEUX ARRETS : la 608 suit les gorges de
 * l'Herault. Un trait direct entre Ganges et Montpellier couperait a travers
 * la garrigue et ne ressemblerait a rien. On decoupe donc le VRAI trace du
 * GTFS, celui qui epouse la route.
 *
 * POURQUOI UNE ROUTE A PART : un trace fait jusqu'a 2 000 points. Les
 * renvoyer pour les douze trajets d'une recherche ferait des centaines de
 * kilo-octets pour un seul qu'on regardera. On les demande quand on choisit.
 *
 * COMMENT ON DECOUPE : on projette chaque arret sur le trace en cherchant le
 * point le plus proche, et on garde la tranche entre les deux. C'est exact au
 * point pres, et un trace de bus passe par definition a quelques metres de
 * ses propres arrets.
 */

/** Distance au carre — la racine ne changerait pas le classement. */
function ecart(aLng: number, aLat: number, bLng: number, bLat: number): number {
  const dLng = aLng - bLng
  const dLat = aLat - bLat
  return dLng * dLng + dLat * dLat
}

function indexLePlusProche(points: [number, number][], lng: number, lat: number): number {
  let meilleur = 0
  let min = Infinity
  for (let i = 0; i < points.length; i++) {
    const d = ecart(points[i][0], points[i][1], lng, lat)
    if (d < min) { min = d; meilleur = i }
  }
  return meilleur
}

export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams
  const trip = (p.get('trip') ?? '').trim()
  const de = (p.get('de') ?? '').trim()
  const vers = (p.get('vers') ?? '').trim()

  if (!trip || !de || !vers) {
    return NextResponse.json({ error: 'Course et arrêts requis' }, { status: 400 })
  }

  const { data: course } = await supabaseAdmin
    .from('transport_courses')
    .select('shape_id, route_id')
    .eq('trip_id', trip)
    .maybeSingle()

  const { data: arrets } = await supabaseAdmin
    .from('transport_arrets')
    .select('stop_id, nom, lat, lng')
    .in('stop_id', [de, vers])

  const aDe = (arrets ?? []).find(a => a.stop_id === de)
  const aVers = (arrets ?? []).find(a => a.stop_id === vers)
  if (!aDe || !aVers) return NextResponse.json({ error: 'Arrêt inconnu' }, { status: 404 })

  // Les arrets intermediaires de la course, entre les deux : ce sont eux
  // qu'on montrera sur le troncon.
  const { data: passages } = await supabaseAdmin
    .from('transport_passages')
    .select('stop_id, ordre, depart, arrivee')
    .eq('trip_id', trip)
    .order('ordre', { ascending: true })

  const iDe = (passages ?? []).findIndex(x => x.stop_id === de)
  const iVers = (passages ?? []).findIndex(x => x.stop_id === vers)
  const desservis = iDe >= 0 && iVers > iDe ? (passages ?? []).slice(iDe, iVers + 1) : []

  const idsDesservis = desservis.map(x => x.stop_id as string)
  const { data: coordsDesservis } = idsDesservis.length
    ? await supabaseAdmin.from('transport_arrets').select('stop_id, nom, lat, lng').in('stop_id', idsDesservis)
    : { data: [] }
  const parId = new Map((coordsDesservis ?? []).map(a => [a.stop_id as string, a]))

  // Le decoupage du trace.
  let points: [number, number][] = []
  if (course?.shape_id) {
    const { data: trace } = await supabaseAdmin
      .from('transport_traces')
      .select('points')
      .eq('shape_id', course.shape_id)
      .maybeSingle()
    const tous = (trace?.points as [number, number][] | undefined) ?? []
    if (tous.length > 1) {
      const i1 = indexLePlusProche(tous, aDe.lng as number, aDe.lat as number)
      const i2 = indexLePlusProche(tous, aVers.lng as number, aVers.lat as number)
      points = i1 <= i2 ? tous.slice(i1, i2 + 1) : tous.slice(i2, i1 + 1).reverse()
    }
  }

  // Repli : si la course n'a pas de trace, on relie les arrets desservis.
  // Un trait anguleux vaut mieux que rien du tout.
  if (points.length === 0) {
    points = desservis
      .map(x => parId.get(x.stop_id as string))
      .filter(Boolean)
      .map(a => [a!.lng as number, a!.lat as number] as [number, number])
  }

  return NextResponse.json({
    trip_id: trip,
    route_id: course?.route_id ?? null,
    points,
    approximatif: !course?.shape_id,
    arrets: desservis.map(x => {
      const a = parId.get(x.stop_id as string)
      return {
        stop_id: x.stop_id,
        nom: a?.nom ?? x.stop_id,
        lat: a?.lat ?? null,
        lng: a?.lng ?? null,
        heure: (x.depart as string | null) ?? (x.arrivee as string | null),
      }
    }),
  })
}
