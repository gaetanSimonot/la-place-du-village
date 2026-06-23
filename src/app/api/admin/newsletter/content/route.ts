import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/server-auth'
import { getContent } from '@/lib/newsletterContent'

/**
 * GET /api/admin/newsletter/content — données des blocs auto (aperçu admin).
 *   ?type=events|promos|annonces|journal|partenaires&count=N&ids=etab:..,prod:..
 *   ?type=search&q=...  → recherche établissements/producteurs (picker partenaires)
 */
export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const sp = new URL(req.url).searchParams
  const type = sp.get('type') ?? ''

  if (type === 'search') {
    const q = (sp.get('q') ?? '').trim()
    if (q.length < 2) return NextResponse.json({ results: [] })
    const like = `%${q}%`
    const [etabs, prods] = await Promise.all([
      supabaseAdmin.from('etablissements').select('id, nom, photos, commune').ilike('nom', like).limit(8),
      supabaseAdmin.from('producers').select('id, nom, photos, commune').ilike('nom', like).limit(8),
    ])
    const results = [
      ...(etabs.data ?? []).map(e => ({ value: `etab:${e.id}`, label: e.nom as string, sub: (e.commune as string) ?? null, image: (e.photos as string[] | null)?.[0] ?? null })),
      ...(prods.data ?? []).map(p => ({ value: `prod:${p.id}`, label: p.nom as string, sub: (p.commune as string) ?? null, image: (p.photos as string[] | null)?.[0] ?? null })),
    ]
    return NextResponse.json({ results })
  }

  const count = Number(sp.get('count') ?? 3)
  const ids = (sp.get('ids') ?? '').split(',').filter(Boolean)
  const items = await getContent(type, count, ids)
  return NextResponse.json({ items })
}
