import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { territoireDeLaRequete } from '@/lib/territoires'
import { lireConfig, ecrireConfig } from '@/lib/configTerritoire'
import type { Territoire } from '@/lib/territoires'

export const dynamic = 'force-dynamic'

/**
 * Bibliothèque d'images de l'admin (URLs réutilisables pour les slots : héro du
 * splash, etc.). Stockée dans config('image_library') = JSON array d'URLs.
 *
 * GET (public)  → { images }
 * POST (admin)  → { url } ajoute (prepend, dédup) ; { url, remove:true } retire.
 */
const KEY = 'image_library'

async function read(terr: Territoire | null): Promise<string[]> {
  // Chaque territoire a SA bibliotheque : les photos de Ganges n'illustrent
  // pas Pau. Vide au depart, ce qui est la reponse juste.
  const valeur = await lireConfig(KEY, terr)
  try {
    const a = valeur ? JSON.parse(valeur) : []
    return Array.isArray(a) ? a.filter((x: unknown): x is string => typeof x === 'string') : []
  } catch { return [] }
}

export async function GET(req: NextRequest) {
  return NextResponse.json({ images: await read(await territoireDeLaRequete(req.url)) })
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx
  const body = await req.json().catch(() => ({}))
  const url = typeof body.url === 'string' ? body.url : ''
  if (!url) return NextResponse.json({ error: 'url manquante' }, { status: 400 })
  const terr = await territoireDeLaRequete(req.url)
  let list = await read(terr)
  list = body.remove ? list.filter(u => u !== url) : [url, ...list.filter(u => u !== url)]
  const res = await ecrireConfig(KEY, JSON.stringify(list), terr)
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 500 })
  return NextResponse.json({ images: list })
}
