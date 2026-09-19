import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { territoireDeLaRequete } from '@/lib/territoires'
import { ecrireConfig } from '@/lib/configTerritoire'

export const dynamic = 'force-dynamic'

/**
 * POST (admin) — enregistre l'élément mis en avant dans la rubrique « À découvrir »
 * du splash. Body = EmbedItem { kind, id, title, subtitle, photo } (ou null pour effacer).
 * Stocké dans config('splash_decouvrir').
 */
export async function POST(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx
  const body = await req.json().catch(() => ({}))
  const value = body && body.kind && body.id
    ? JSON.stringify({
        kind: String(body.kind),
        id: String(body.id),
        title: String(body.title ?? ''),
        subtitle: body.subtitle != null ? String(body.subtitle) : null,
        photo: body.photo != null ? String(body.photo) : null,
      })
    : ''
  // Le reglage appartient au territoire administre : c'est `ecrireConfig` qui
  // tranche entre `config` (territoire par defaut, table inchangee) et
  // `config_territoire`. La decision ne doit exister qu'a UN endroit.
  const terr = await territoireDeLaRequete(req.url)
  const res = await ecrireConfig('splash_decouvrir', value, terr)
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 500 })
  return NextResponse.json({ success: true })
}
