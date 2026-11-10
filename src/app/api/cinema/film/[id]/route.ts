import { NextRequest, NextResponse } from 'next/server'
import { lireFilm } from '@/lib/cinema-server'
import { territoireDeLaRequete } from '@/lib/territoires'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/cinema/film/[id] — un film et ses séances à venir.
 *
 * Public, sans compte. Les séances ne sont retournées que pour les salles
 * ayant le module accordé : un film reste en base quand un cinéma perd le
 * module, ses séances ne doivent plus s'afficher pour autant. La lecture
 * elle-même est dans lib/cinema-server (partagée avec la fiche serveur).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const terr = await territoireDeLaRequete(req.url)
  const payload = await lireFilm(id, terr?.id ?? null)
  if (!payload) return NextResponse.json({ error: 'Film introuvable' }, { status: 404 })
  return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } })
}
