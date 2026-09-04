import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const revalidate = 0
export const fetchCache = 'force-no-store'

/**
 * GET /api/transport/ligne?route=608
 *
 * Tout ce qu'il faut pour dessiner une ligne sur la carte : ses arrets avec
 * leurs coordonnees, et son trace.
 *
 * UN TRACE PAR SENS, pas 51. Le GTFS decrit une geometrie par variante de
 * parcours — la 608 en a 51, la plupart quasi identiques (un detour, un arret
 * de moins le dimanche). Les empiler donnerait un trait baveux. On garde donc,
 * pour chaque sens, la variante la PLUS LONGUE : celle qui passe par le plus
 * de monde, et qui contient visuellement les autres.
 */
export async function GET(req: NextRequest) {
  const routeId = (new URL(req.url).searchParams.get('route') ?? '608').trim()

  const { data: ligne } = await supabaseAdmin
    .from('transport_lignes')
    .select('route_id, nom_court, nom_long, couleur, couleur_texte, maj')
    .eq('route_id', routeId)
    .maybeSingle()

  if (!ligne) {
    return NextResponse.json({ error: 'Ligne inconnue ou pas encore importée' }, { status: 404 })
  }

  const { data: courses } = await supabaseAdmin
    .from('transport_courses')
    .select('trip_id, shape_id, sens, destination')
    .eq('route_id', routeId)

  const idsTraces = Array.from(new Set((courses ?? []).map(c => c.shape_id).filter(Boolean))) as string[]
  const { data: traces } = idsTraces.length
    ? await supabaseAdmin.from('transport_traces').select('shape_id, points').in('shape_id', idsTraces)
    : { data: [] }

  // La variante la plus longue de chaque sens.
  const parSens = new Map<number, { shape_id: string; points: unknown[]; destination: string | null }>()
  for (const c of courses ?? []) {
    if (!c.shape_id) continue
    const t = (traces ?? []).find(x => x.shape_id === c.shape_id)
    if (!t) continue
    const pts = (t.points as unknown[]) ?? []
    const sens = c.sens ?? 0
    const actuel = parSens.get(sens)
    if (!actuel || pts.length > actuel.points.length) {
      parSens.set(sens, { shape_id: c.shape_id, points: pts, destination: c.destination ?? null })
    }
  }

  // Les arrets desservis par la ligne, dedupliques.
  const idsCourses = (courses ?? []).map(c => c.trip_id)
  const idsArrets = new Set<string>()
  // Par paquets : `in` sur 89 identifiants passe, mais la liste grandira avec
  // les lignes suivantes.
  for (let i = 0; i < idsCourses.length; i += 50) {
    const { data } = await supabaseAdmin
      .from('transport_passages')
      .select('stop_id')
      .in('trip_id', idsCourses.slice(i, i + 50))
    for (const p of data ?? []) idsArrets.add(p.stop_id as string)
  }

  const listeArrets = Array.from(idsArrets)
  const arrets: unknown[] = []
  for (let i = 0; i < listeArrets.length; i += 200) {
    const { data } = await supabaseAdmin
      .from('transport_arrets')
      .select('stop_id, nom, lat, lng')
      .in('stop_id', listeArrets.slice(i, i + 200))
    arrets.push(...(data ?? []))
  }

  return NextResponse.json({
    ligne,
    arrets,
    traces: Array.from(parSens.entries()).map(([sens, t]) => ({ sens, ...t })),
    // L'ODbL demande de citer la source. Elle voyage avec les donnees plutot
    // que d'etre recopiee dans un coin de l'interface, ou on l'oublierait.
    source: 'Réseau liO — Région Occitanie, via transport.data.gouv.fr (ODbL)',
  })
}
