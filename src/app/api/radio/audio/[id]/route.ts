import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * GET /api/radio/audio/<id> — l'émission, servie depuis NOTRE domaine.
 *
 * Le podcast est hébergé chez la radio, et son serveur ne renvoie pas
 * d'en-tête `Access-Control-Allow-Origin`. Le navigateur refuse donc de le
 * lire depuis laplaceduvillage.app : « blocked by CORS policy », lecteur muet,
 * et rien à l'écran pour l'expliquer.
 *
 * On relaie donc le flux. Même origine, plus de refus — et l'adresse de
 * lecture devient la même que le fichier vienne de chez eux ou de notre
 * Storage : la page n'a plus à savoir d'où il sort.
 *
 * LES PLAGES D'OCTETS SONT TRANSMISES TELLES QUELLES. Sans elles on ne peut
 * pas se déplacer dans l'émission : le navigateur redemande le fichier entier
 * à chaque saut, et la barre de progression devient inutilisable sur une
 * demi-heure d'audio.
 *
 * Seules les émissions publiées sont relayées — la route est publique, elle ne
 * doit pas servir de tuyau vers un brouillon.
 */

export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { data: emission } = await supabaseAdmin
    .from('radio_emissions').select('audio_url, statut')
    .eq('id', params.id).maybeSingle()

  if (!emission || emission.statut !== 'publie') {
    return NextResponse.json({ error: 'Émission introuvable' }, { status: 404 })
  }

  const amont = String(emission.audio_url)
  let hote: URL
  try {
    hote = new URL(amont)
  } catch {
    return NextResponse.json({ error: 'Adresse audio invalide' }, { status: 502 })
  }
  if (hote.protocol !== 'https:' && hote.protocol !== 'http:') {
    return NextResponse.json({ error: 'Adresse audio invalide' }, { status: 502 })
  }

  const plage = req.headers.get('range')

  let amontRes: Response
  try {
    amontRes = await fetch(amont, {
      headers: plage ? { Range: plage } : undefined,
      // Pas de cache Next ici : un fichier de plusieurs mégaoctets n'a rien à
      // faire dans le cache de données, et il dépasserait la limite de taille.
      cache: 'no-store',
    })
  } catch (e) {
    return NextResponse.json({ error: `Audio injoignable (${(e as Error).message})` }, { status: 502 })
  }

  if (!amontRes.ok && amontRes.status !== 206) {
    return NextResponse.json({ error: `Audio injoignable (${amontRes.status})` }, { status: 502 })
  }

  const entetes = new Headers()
  for (const nom of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag']) {
    const v = amontRes.headers.get(nom)
    if (v) entetes.set(nom, v)
  }
  if (!entetes.has('content-type')) entetes.set('content-type', 'audio/mpeg')
  if (!entetes.has('accept-ranges')) entetes.set('accept-ranges', 'bytes')
  // Une émission ne change plus une fois diffusée : le navigateur peut la
  // garder. Le CDN, lui, ne doit pas stocker des dizaines de mégaoctets par
  // requête partielle — d'où `private`.
  entetes.set('cache-control', 'private, max-age=3600')

  return new NextResponse(amontRes.body, { status: amontRes.status, headers: entetes })
}
