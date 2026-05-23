import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'
import { normalizeProduitCat } from '@/lib/produit-cats'

/**
 * GET /api/favoris — payload regroupé pour FavorisView.
 *
 * Avant : FavorisView au mount lançait 4 fetch parallèles :
 *   · producer_favorites + producers
 *   · producer_followers + producers
 *   · etablissement_favorites + etablissements
 *   · etablissement_followers + etablissements
 * = 4 round-trips Supabase + jointures côté client.
 *
 * Après : 1 fetch HTTP, le serveur fait les queries Promise.all.
 *
 * PERSO → Cache-Control: private, no-store.
 */

export const dynamic = 'force-dynamic'

interface ProducerMin {
  id: string; nom: string; commune: string | null; photos: string[];
  produit_categories: string[];
}
interface EtabMin {
  id: string; nom: string; commune: string | null; photos: string[]; type: string;
}

export async function GET(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  // Étape 1 : récupère les ids depuis les 4 tables de liaison en parallèle
  const [pFavRowsRes, pFollowRowsRes, eFavRowsRes, eFollowRowsRes] = await Promise.all([
    supabaseAdmin.from('producer_favorites').select('producer_id').eq('user_id', ctx.userId),
    supabaseAdmin.from('producer_followers').select('producer_id').eq('user_id', ctx.userId),
    supabaseAdmin.from('etablissement_favorites').select('etablissement_id').eq('user_id', ctx.userId),
    supabaseAdmin.from('etablissement_followers').select('etablissement_id').eq('user_id', ctx.userId),
  ])

  const pFavIds    = (pFavRowsRes.data    ?? []).map((r: { producer_id: string }) => r.producer_id)
  const pFollowIds = (pFollowRowsRes.data ?? []).map((r: { producer_id: string }) => r.producer_id)
  const eFavIds    = (eFavRowsRes.data    ?? []).map((r: { etablissement_id: string }) => r.etablissement_id)
  const eFollowIds = (eFollowRowsRes.data ?? []).map((r: { etablissement_id: string }) => r.etablissement_id)

  // Étape 2 : fetch les entités liées (dédup pour ne charger chaque entité qu'une fois)
  const allPIds = Array.from(new Set([...pFavIds, ...pFollowIds]))
  const allEIds = Array.from(new Set([...eFavIds, ...eFollowIds]))

  const [producersRes, etabsRes] = await Promise.all([
    allPIds.length
      ? supabaseAdmin.from('producers').select('id, nom, commune, photos, products(categorie, disponible)').in('id', allPIds)
      : Promise.resolve({ data: [] }),
    allEIds.length
      ? supabaseAdmin.from('etablissements').select('id, nom, commune, photos, type').in('id', allEIds)
      : Promise.resolve({ data: [] }),
  ])

  const producersById: Record<string, ProducerMin> = {}
  for (const p of (producersRes.data ?? []) as Array<{
    id: string; nom: string; commune: string | null; photos: string[] | null;
    products: { categorie: string; disponible: boolean }[] | null;
  }>) {
    producersById[p.id] = {
      id: p.id, nom: p.nom, commune: p.commune, photos: p.photos ?? [],
      produit_categories: Array.from(new Set((p.products ?? []).filter(pr => pr.disponible).map(pr => normalizeProduitCat(pr.categorie)))),
    }
  }
  const etabsById: Record<string, EtabMin> = {}
  for (const e of (etabsRes.data ?? []) as Array<{
    id: string; nom: string; commune: string | null; photos: string[] | null; type: string;
  }>) {
    etabsById[e.id] = { id: e.id, nom: e.nom, commune: e.commune, photos: e.photos ?? [], type: e.type }
  }

  return NextResponse.json({
    producerFavs:    pFavIds.map(id => producersById[id]).filter(Boolean),
    producerFollows: pFollowIds.map(id => producersById[id]).filter(Boolean),
    etabFavs:        eFavIds.map(id => etabsById[id]).filter(Boolean),
    etabFollows:     eFollowIds.map(id => etabsById[id]).filter(Boolean),
  }, {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
