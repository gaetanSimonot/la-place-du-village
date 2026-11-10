import { NextRequest, NextResponse } from 'next/server'
import { lireSpectacle } from '@/lib/theatre-server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/theatre/spectacle/[id] — une fiche et toutes ses dates, passées
 * comprises. Sans compte, comme le reste du module. La lecture est dans
 * lib/theatre-server (partagée avec la fiche serveur).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const payload = await lireSpectacle(id)
  if (!payload) return NextResponse.json({ error: 'introuvable' }, { status: 404 })
  return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } })
}
