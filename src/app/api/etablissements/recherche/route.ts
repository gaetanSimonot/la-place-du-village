import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'
import { normaliser, scoreFiche } from '@/lib/rechercheTolerante'

export const dynamic = 'force-dynamic'

/**
 * GET /api/etablissements/recherche?q=… — trouver SA fiche dans toute l'app
 * (circuit « créer un bon plan »), tolérant aux accents et aux fautes
 * (cf. rechercheTolerante). Aucun appel Google : rien n'est facturé.
 *
 * Tous territoires confondus : un commerçant cherche son commerce, pas la
 * ville qu'il regarde. Les fiches sont gardées en mémoire 5 min par instance.
 */

interface Ligne { id: string; nom: string; commune: string | null; type: string | null; photos: string[] | null; user_id: string | null }

let cache: { t: number; fiches: Ligne[] } | null = null
const DUREE_CACHE = 5 * 60 * 1000

async function toutesLesFiches(): Promise<Ligne[]> {
  if (cache && Date.now() - cache.t < DUREE_CACHE) return cache.fiches
  const fiches: Ligne[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin.from('etablissements')
      .select('id, nom, commune, type, photos, user_id').range(from, from + 999)
    if (error) throw error
    fiches.push(...((data ?? []) as Ligne[]))
    if (!data || data.length < 1000) break
  }
  cache = { t: Date.now(), fiches }
  return fiches
}

export async function GET(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx
  const q = normaliser(req.nextUrl.searchParams.get('q') ?? '').slice(0, 60)
  if (q.length < 2) return NextResponse.json({ fiches: [] })

  const fiches = await toutesLesFiches().catch(() => null)
  if (!fiches) return NextResponse.json({ error: 'Recherche indisponible' }, { status: 500 })

  const resultats = fiches
    .map(f => ({ f, s: scoreFiche(q, f.nom, f.commune) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s || a.f.nom.length - b.f.nom.length)
    .slice(0, 8)
    .map(({ f }) => ({
      id: f.id, nom: f.nom, commune: f.commune, type: f.type,
      photo: f.photos?.[0] ?? null,
      claimed: !!f.user_id,
      mienne: f.user_id === ctx.userId,
    }))

  return NextResponse.json({ fiches: resultats })
}
