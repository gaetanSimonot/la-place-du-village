import { NextRequest, NextResponse } from 'next/server'
import { chercherTrajets } from '@/lib/transportRecherche'

export const revalidate = 0
export const fetchCache = 'force-no-store'

/**
 * GET /api/transport/trajet?de=<ids>&vers=<ids>&date=AAAA-MM-JJ&heure=HH:MM
 *
 * Les prochains cars entre deux ensembles d'arrets, un jour donne.
 *
 * `de` et `vers` acceptent PLUSIEURS identifiants separes par des virgules :
 * une commune, c'est plusieurs arrets (Ganges en a 4, Saint-Gely-du-Fesc 18),
 * et le GTFS decrit meme les deux cotes de la route comme deux arrets.
 *
 * Le calcul lui-meme vit dans src/lib/transportRecherche.ts, partage avec
 * l'assistant vocal : deux copies finiraient par repondre differemment sur le
 * meme trajet.
 */
export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams
  const de = (p.get('de') ?? '').split(',').map(x => x.trim()).filter(Boolean)
  const vers = (p.get('vers') ?? '').split(',').map(x => x.trim()).filter(Boolean)
  const date = (p.get('date') ?? '').trim()
  const heure = (p.get('heure') ?? '00:00').trim()

  if (de.length === 0 || vers.length === 0) {
    return NextResponse.json({ error: 'Départ et arrivée requis' }, { status: 400 })
  }
  if (de.some(x => vers.includes(x))) {
    return NextResponse.json({ error: 'Le départ et l’arrivée sont au même endroit' }, { status: 400 })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Date attendue au format AAAA-MM-JJ' }, { status: 400 })
  }
  if (!/^\d{2}:\d{2}$/.test(heure)) {
    return NextResponse.json({ error: 'Heure attendue au format HH:MM' }, { status: 400 })
  }

  const r = await chercherTrajets(de, vers, date, heure)

  return NextResponse.json({
    ...r,
    // L'ODbL demande de citer la source. Elle voyage avec les données plutôt
    // que d'être recopiée dans un coin de l'interface, où on l'oublierait.
    source: 'Réseau liO — Région Occitanie, via transport.data.gouv.fr (ODbL)',
  })
}
