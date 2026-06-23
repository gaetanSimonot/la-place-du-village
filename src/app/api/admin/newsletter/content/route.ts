import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { getContent, search } from '@/lib/newsletterContent'

/**
 * GET /api/admin/newsletter/content
 *   ?search=events|promos|annonces|partenaires&q=…  → recherche (picker)
 *   ?type=events|promos|annonces|journal|partenaires&count=N&ids=a,b  → items (aperçu)
 */
export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const sp = new URL(req.url).searchParams
  const searchKind = sp.get('search')
  if (searchKind) {
    const q = (sp.get('q') ?? '').trim()
    if (q.length < 2) return NextResponse.json({ results: [] })
    return NextResponse.json({ results: await search(searchKind, q) })
  }

  const type = sp.get('type') ?? ''
  const count = Number(sp.get('count') ?? 4)
  const ids = (sp.get('ids') ?? '').split(',').filter(Boolean)
  return NextResponse.json({ items: await getContent(type, count, ids) })
}
