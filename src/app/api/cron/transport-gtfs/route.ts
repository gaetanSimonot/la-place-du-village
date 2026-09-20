import { NextRequest, NextResponse } from 'next/server'
import { importerReseau, reseauDe, RESEAUX } from '@/lib/transportGtfs'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Cron Vercel — rapatrie les GTFS des reseaux declares et remet a jour les
 * horaires de bus. UN RESEAU PAR TERRITOIRE : liO pour les Cevennes, le
 * reseau interurbain des Pyrenees-Atlantiques pour Pau.
 *
 * Une fois par semaine suffit : le fichier est publie pour une saison
 * entiere (l'actuel court jusqu'au 31 aout 2027) et l'exploitant le
 * republie quand un horaire bouge. Le rejouer est sans risque : tout est en
 * upsert sur les cles du GTFS, relancer dix fois de suite donne le meme
 * resultat.
 *
 * Meme garde que les autres crons du projet : CRON_SECRET si defini, sinon
 * l'agent `vercel-cron`.
 *
 * Appel manuel possible avec `?lignes=608,610` pour forcer un perimetre —
 * utile pour ajouter une ligne sans attendre le prochain passage. Dans ce
 * cas `?territoire=` dit DE QUEL reseau il s'agit : un numero de ligne seul
 * ne suffit plus a le deviner.
 *
 * UN RESEAU QUI ECHOUE N'ARRETE PAS LES AUTRES. Le fichier d'un exploitant
 * peut etre momentanement indisponible ; ce n'est pas une raison pour laisser
 * la deuxieme ville sans horaires.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const ua = req.headers.get('user-agent') ?? ''
  const secret = process.env.CRON_SECRET

  const autorise = secret
    ? auth === `Bearer ${secret}`
    : ua.toLowerCase().includes('vercel-cron')

  if (!autorise) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = new URL(req.url).searchParams
  const demandees = (params.get('lignes') ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const slug = params.get('territoire')

  const cibles = slug ? [reseauDe(slug)].filter(Boolean) as typeof RESEAUX : RESEAUX
  if (!cibles.length) {
    return NextResponse.json({ error: `Aucun reseau declare pour « ${slug} »` }, { status: 400 })
  }

  try {
    const bilans: Record<string, unknown>[] = []
    for (const reseau of cibles) {
      try {
        const bilan = await importerReseau(reseau, demandees)
        bilans.push({ territoire: reseau.territoire, reseau: reseau.nom, ...bilan })
      } catch (e) {
        bilans.push({ territoire: reseau.territoire, reseau: reseau.nom,
          erreur: e instanceof Error ? e.message : 'Erreur inconnue' })
      }
    }
    const echecs = bilans.filter(b => b.erreur).length
    return NextResponse.json({ success: echecs < bilans.length, reseaux: bilans })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
