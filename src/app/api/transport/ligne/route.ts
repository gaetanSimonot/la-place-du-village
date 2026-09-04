import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const revalidate = 0
export const fetchCache = 'force-no-store'

/**
 * GET /api/transport/ligne            → tout le reseau importe
 * GET /api/transport/ligne?route=608  → une seule ligne
 *
 * Ce qu'il faut pour dessiner les lignes sur la carte : les arrets avec leurs
 * coordonnees, et les traces.
 *
 * UN TRACE PAR LIGNE ET PAR SENS, pas 119. Le GTFS decrit une geometrie par
 * variante de parcours — la 608 en a 51 a elle seule, la plupart quasi
 * identiques (un detour, un arret de moins le dimanche). Les empiler donnerait
 * un trait baveux. On garde, pour chaque ligne et chaque sens, la variante la
 * PLUS LONGUE : celle qui dessert le plus de monde, et qui contient
 * visuellement les autres.
 *
 * ET ON ALLEGE. Les 119 traces du reseau font 115 000 points, soit plusieurs
 * megaoctets de JSON pour un fond de carte. On ne garde qu'un point tous les
 * ~15 metres : a l'echelle d'une carte, la difference est invisible, et le
 * poids est divise par plusieurs.
 */

/** ~15 m en degres sous nos latitudes. Suffisant pour une route de montagne. */
const PAS_MINIMAL = 0.00015

/** Retire les points trop rapproches. Garde toujours le premier et le dernier. */
function alleger(points: [number, number][]): [number, number][] {
  if (points.length < 3) return points
  const out: [number, number][] = [points[0]]
  let [refLng, refLat] = points[0]
  for (let i = 1; i < points.length - 1; i++) {
    const [lng, lat] = points[i]
    if (Math.abs(lng - refLng) + Math.abs(lat - refLat) < PAS_MINIMAL) continue
    out.push(points[i])
    refLng = lng; refLat = lat
  }
  out.push(points[points.length - 1])
  return out
}

export async function GET(req: NextRequest) {
  const demandee = (new URL(req.url).searchParams.get('route') ?? '').trim()

  let qLignes = supabaseAdmin
    .from('transport_lignes')
    .select('route_id, nom_court, nom_long, couleur, couleur_texte, maj')
  if (demandee) qLignes = qLignes.eq('route_id', demandee)
  const { data: lignes } = await qLignes

  if (!lignes || lignes.length === 0) {
    return NextResponse.json({ error: 'Aucune ligne importée' }, { status: 404 })
  }

  const idsLignes = lignes.map(l => l.route_id as string)

  const { data: courses } = await supabaseAdmin
    .from('transport_courses')
    .select('trip_id, route_id, shape_id, sens, destination')
    .in('route_id', idsLignes)

  const idsTraces = Array.from(new Set((courses ?? []).map(c => c.shape_id).filter(Boolean))) as string[]
  const traces = new Map<string, [number, number][]>()
  for (let i = 0; i < idsTraces.length; i += 60) {
    const { data } = await supabaseAdmin
      .from('transport_traces').select('shape_id, points')
      .in('shape_id', idsTraces.slice(i, i + 60))
    for (const t of data ?? []) traces.set(t.shape_id as string, (t.points as [number, number][]) ?? [])
  }

  // La variante la plus longue de chaque (ligne, sens).
  const parCle = new Map<string, { route_id: string; sens: number; shape_id: string; points: [number, number][] }>()
  for (const c of courses ?? []) {
    if (!c.shape_id) continue
    const pts = traces.get(c.shape_id as string)
    if (!pts || pts.length < 2) continue
    const sens = (c.sens as number) ?? 0
    const cle = `${c.route_id}:${sens}`
    const actuel = parCle.get(cle)
    if (!actuel || pts.length > actuel.points.length) {
      parCle.set(cle, { route_id: c.route_id as string, sens, shape_id: c.shape_id as string, points: pts })
    }
  }

  // Les arrets desservis, par paquets : `in` a ses limites.
  const idsCourses = (courses ?? []).map(c => c.trip_id as string)
  const idsArrets = new Set<string>()
  for (let i = 0; i < idsCourses.length; i += 50) {
    const { data } = await supabaseAdmin
      .from('transport_passages').select('stop_id')
      .in('trip_id', idsCourses.slice(i, i + 50))
    for (const p of data ?? []) idsArrets.add(p.stop_id as string)
  }

  const listeArrets = Array.from(idsArrets)
  const arrets: unknown[] = []
  for (let i = 0; i < listeArrets.length; i += 200) {
    const { data } = await supabaseAdmin
      .from('transport_arrets').select('stop_id, nom, lat, lng')
      .in('stop_id', listeArrets.slice(i, i + 200))
    arrets.push(...(data ?? []))
  }

  const couleurDe = new Map(lignes.map(l => [l.route_id as string, (l.couleur as string | null) ?? '#2D5A3D']))

  return NextResponse.json({
    // Rétrocompatible : quand une seule ligne est demandée, `ligne` reste là.
    ligne: demandee ? lignes[0] : null,
    lignes,
    arrets,
    traces: Array.from(parCle.values()).map(t => ({
      route_id: t.route_id,
      sens: t.sens,
      couleur: couleurDe.get(t.route_id) ?? '#2D5A3D',
      points: alleger(t.points),
    })),
    // L'ODbL demande de citer la source. Elle voyage avec les données plutôt
    // que d'être recopiée dans un coin de l'interface, où on l'oublierait.
    source: 'Réseau liO — Région Occitanie, via transport.data.gouv.fr (ODbL)',
  })
}
