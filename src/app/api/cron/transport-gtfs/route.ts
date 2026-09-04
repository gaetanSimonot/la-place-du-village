import { NextRequest, NextResponse } from 'next/server'
import { importerGtfsLio, LIGNES_RETENUES } from '@/lib/transportGtfs'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Cron Vercel — rapatrie le GTFS liO et remet a jour les horaires de bus.
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
 * Appel manuel possible avec `?lignes=608,610` pour forcer un peritmetre —
 * utile pour ajouter une ligne sans attendre le prochain passage.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const ua = req.headers.get('user-agent') ?? ''
  const secret = process.env.CRON_SECRET

  const autorise = secret
    ? auth === `Bearer ${secret}`
    : ua.toLowerCase().includes('vercel-cron')

  if (!autorise) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const demandees = (new URL(req.url).searchParams.get('lignes') ?? '')
    .split(',').map(s => s.trim()).filter(Boolean)

  try {
    const bilan = await importerGtfsLio(demandees.length ? demandees : LIGNES_RETENUES)
    return NextResponse.json({ success: true, ...bilan })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
