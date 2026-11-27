import { NextRequest, NextResponse } from 'next/server'
import { listeDeLaPage, PAR_PAGE, type SourcePage } from '@/lib/agendaPublic'

/**
 * GET /api/pages-entree?niveau=commune&slug=ganges[&type=ateliers]&depuis=30
 *
 * La suite de la liste d'une page d'entrée (« Que faire à Ganges »), PAR_PAGE
 * à la fois, quand on descend — comme l'agenda de l'app. Même liste, même
 * ordre que la page (listeDeLaPage). Lecture seule, données déjà publiques.
 */
const NIVEAUX = new Set(['commune', 'territoire', 'week-end', 'noel'])
const SLUG = /^[a-z0-9-]{1,80}$/

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const niveau = sp.get('niveau') ?? ''
  const slug = sp.get('slug') ?? ''
  const type = sp.get('type') || undefined
  const commune = sp.get('commune') || undefined
  const depuis = Math.min(5000, Math.max(0, Math.floor(Number(sp.get('depuis')) || 0)))
  if (!NIVEAUX.has(niveau) || !SLUG.test(slug) || (type && !SLUG.test(type)) || (commune && !SLUG.test(commune))) {
    return NextResponse.json({ error: 'requête invalide' }, { status: 400 })
  }
  const src = (niveau === 'week-end' ? { niveau, slug } : niveau === 'noel' ? { niveau, slug, type, commune } : { niveau, slug, type }) as SourcePage
  const liste = await listeDeLaPage(src)
  if (!liste) return NextResponse.json({ error: 'introuvable' }, { status: 404 })
  return NextResponse.json({ evenements: liste.slice(depuis, depuis + PAR_PAGE), total: liste.length })
}
