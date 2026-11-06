import { NextRequest, NextResponse } from 'next/server'
import { GET as lireHub } from '../../hub/route'
import { GET as lireCinema } from '../../cinema/affiche/route'
import { GET as lireBois } from '../../champignons/route'
import { GET as lireTheatre } from '../../theatre/route'
import { GET as lireRadio } from '../../radio/route'
import { GET as lireAnnonces } from '../../annonces/route'

export const dynamic = 'force-dynamic'

/**
 * GET /api/village/instantane?territoire=<slug> — LA PAGE DU VILLAGE EN UN SEUL PAQUET.
 *
 * Un téléphone qui ouvre l'appli pour la première fois n'a rien en mémoire
 * (cf. SWRProvider) : ses sept blocs demandaient chacun leur part, et sur un
 * réseau lent la page se construisait sous ses yeux. Ce paquet les réunit,
 * vu comme un visiteur anonyme — la même image pour tout le monde —, et
 * reste une minute sur le réseau de Vercel : il arrive en une demande,
 * souvent sans même réveiller le serveur. ChargementGroupe le verse dans le
 * cache de chaque bloc, qui se rafraîchit ensuite comme d'habitude.
 *
 * Ce sont les routes elles-mêmes qui répondent : aucune règle n'est
 * recopiée ici, le paquet ne peut pas diverger de ce que voient les blocs.
 */
export async function GET(req: NextRequest) {
  const slug = new URL(req.url).searchParams.get('territoire') ?? ''
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return NextResponse.json({ error: 'territoire' }, { status: 400 })

  const base = new URL(req.url).origin
  const t = `territoire=${encodeURIComponent(slug)}`
  const jour = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())

  const lire = async (route: (r: NextRequest) => Promise<Response>, chemin: string) => {
    try {
      const r = await route(new NextRequest(`${base}${chemin}`))
      return r.ok ? await r.json() : null
    } catch { return null }
  }

  const [hub, cinema, champignons, theatre, radio, annonces] = await Promise.all([
    lire(lireHub, `/api/hub?d=${jour}&${t}`),
    lire(lireCinema, `/api/cinema/affiche?${t}`),
    lire(lireBois, `/api/champignons?${t}`),
    lire(lireTheatre, `/api/theatre?${t}`),
    lire(lireRadio, `/api/radio?${t}`),
    lire(lireAnnonces, `/api/annonces?limit=20&${t}`),
  ])

  return NextResponse.json(
    { jour, blocs: { hub, cinema, champignons, theatre, radio, annonces } },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } })
}
