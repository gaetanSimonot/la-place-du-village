import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { territoireDeLaRequete } from '@/lib/territoires'
import { getContent, search, browseList } from '@/lib/newsletterContent'

/**
 * GET /api/admin/newsletter/content
 *   ?search=events|promos|annonces|partenaires&q=…  → recherche (picker)
 *   ?type=events|promos|annonces|journal|partenaires&count=N&ids=a,b  → items (aperçu)
 */
export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const sp = new URL(req.url).searchParams
  // Ce qu'on propose a l'admin vient de SA ville : lui faire choisir un
  // evenement cevenol pour la lettre de Pau n'aurait aucun sens.
  const terr = (await territoireDeLaRequete(req.url))?.id ?? null

  const browseKind = sp.get('browse')
  if (browseKind) return NextResponse.json({ results: await browseList(browseKind, terr) })

  const searchKind = sp.get('search')
  if (searchKind) {
    const q = (sp.get('q') ?? '').trim()
    if (q.length < 2) return NextResponse.json({ results: [] })
    return NextResponse.json({ results: await search(searchKind, q, terr) })
  }

  const type = sp.get('type') ?? ''
  const count = Number(sp.get('count') ?? 4)
  const ids = (sp.get('ids') ?? '').split(',').filter(Boolean)
  return NextResponse.json({ items: await getContent(type, count, ids, terr) })
}
