import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

export type EmbedKind = 'event' | 'etab' | 'producer' | 'annonce' | 'promo' | 'covoit'

/**
 * GET /api/search/embed?q=...&kinds=event,etab,...
 *
 * Recherche multi-source dans la DB de l'app (jamais d'API externe) pour
 * piocher un élément à embed dans un post ou un message de chat.
 *
 * Retourne { results: Array<{ kind, id, title, subtitle, photo }> }
 * groupé par catégorie côté client.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim()
  const kindsParam = url.searchParams.get('kinds') ?? ''
  const requested: EmbedKind[] = kindsParam
    ? (kindsParam.split(',').filter(k => ['event','etab','producer','annonce','promo','covoit'].includes(k)) as EmbedKind[])
    : ['event','etab','producer','annonce','promo','covoit']

  // Mode "browse" : pas de query mais 1 seul kind demandé → liste les
  // items récents de ce kind (pour le picker en mode "j'entre dans une
  // catégorie"). Sinon, query < 2 chars → tableau vide.
  const browseSingleKind = q.length < 2 && requested.length === 1
  if (q.length < 2 && !browseSingleKind) {
    return NextResponse.json({ results: [] })
  }

  const ilike = q.length >= 2 ? `%${q.replace(/%/g, '\\%')}%` : null
  // Mode browse : on remonte plus d'items (30) pour permettre de scroller
  const LIMIT = browseSingleKind ? 30 : 8

  type Task = Promise<{ kind: EmbedKind; rows: Array<{ id: string; title: string; subtitle: string | null; photo: string | null }> }>
  const tasks: Task[] = []

  if (requested.includes('event')) {
    tasks.push((async () => {
      let qb = supabaseAdmin
        .from('evenements')
        .select('id, titre, image_url, date_debut, lieux(commune)')
        .eq('statut', 'publie')
      if (ilike) qb = qb.ilike('titre', ilike)
      const { data } = await qb
        .order('date_debut', { ascending: true })
        .limit(LIMIT)
      return {
        kind: 'event' as const,
        rows: (data ?? []).map(e => {
          const lieuRaw = (e as { lieux?: { commune?: string | null } | { commune?: string | null }[] | null }).lieux
          const lieu = Array.isArray(lieuRaw) ? lieuRaw[0] : lieuRaw
          return {
            id: e.id as string,
            title: e.titre as string,
            subtitle: lieu?.commune ?? null,
            photo: (e.image_url as string | null) ?? null,
          }
        }),
      }
    })())
  }

  if (requested.includes('etab')) {
    tasks.push((async () => {
      let qb = supabaseAdmin
        .from('etablissements')
        .select('id, nom, commune, photos')
      if (ilike) qb = qb.ilike('nom', ilike)
      const { data } = await qb.order('nom', { ascending: true }).limit(LIMIT)
      return {
        kind: 'etab' as const,
        rows: (data ?? []).map(e => ({
          id: e.id as string,
          title: e.nom as string,
          subtitle: (e.commune as string | null) ?? null,
          photo: ((e.photos as string[] | null) ?? [])[0] ?? null,
        })),
      }
    })())
  }

  if (requested.includes('producer')) {
    tasks.push((async () => {
      let qb = supabaseAdmin
        .from('producers')
        .select('id, nom, commune, photos')
      if (ilike) qb = qb.ilike('nom', ilike)
      const { data } = await qb.order('nom', { ascending: true }).limit(LIMIT)
      return {
        kind: 'producer' as const,
        rows: (data ?? []).map(p => ({
          id: p.id as string,
          title: p.nom as string,
          subtitle: (p.commune as string | null) ?? null,
          photo: ((p.photos as string[] | null) ?? [])[0] ?? null,
        })),
      }
    })())
  }

  if (requested.includes('annonce')) {
    tasks.push((async () => {
      // Réplique EXACTE de /api/annonces GET (mode public) : statuts
      // 'active' et 'don_final' (l'annuaire publique). Sur la page
      // /annonces, c'est ces statuts qu'on voit — on remonte les mêmes ici.
      let qb = supabaseAdmin
        .from('annonces')
        .select('id, titre, photos, prix, statut, type')
        .in('statut', ['active', 'don_final'])
      if (ilike) qb = qb.ilike('titre', ilike)
      const { data } = await qb
        .order('created_at', { ascending: false })
        .limit(LIMIT)
      return {
        kind: 'annonce' as const,
        rows: (data ?? []).map(a => ({
          id: a.id as string,
          title: a.titre as string,
          subtitle: (a.type as string | null) ?? null,
          photo: ((a.photos as string[] | null) ?? [])[0] ?? null,
        })),
      }
    })())
  }

  if (requested.includes('promo')) {
    tasks.push((async () => {
      // Réplique EXACTE de /api/promotions GET (mode public).
      // ATTENTION : la colonne s'appelle "title" en DB pour promotions
      // (et "titre" pour annonces/evenements). Pas la même conv.
      const nowISO = new Date().toISOString()
      let qb = supabaseAdmin
        .from('promotions')
        .select('id, title, image_url, description')
        .eq('active', true)
        .or(`valid_until.is.null,valid_until.gte.${nowISO}`)
      if (ilike) qb = qb.ilike('title', ilike)
      const { data } = await qb.order('created_at', { ascending: false }).limit(LIMIT)
      return {
        kind: 'promo' as const,
        rows: (data ?? []).map(p => ({
          id: p.id as string,
          title: (p.title as string | null) ?? 'Promotion',
          subtitle: (p.description as string | null) ?? null,
          photo: (p.image_url as string | null) ?? null,
        })),
      }
    })())
  }

  if (requested.includes('covoit')) {
    tasks.push((async () => {
      let qb = supabaseAdmin
        .from('covoit_trajets')
        .select('id, ville_depart, ville_arrivee, date_depart')
      if (ilike) qb = qb.or(`ville_depart.ilike.${ilike},ville_arrivee.ilike.${ilike}`)
      const { data } = await qb
        .order('date_depart', { ascending: true })
        .limit(LIMIT)
      return {
        kind: 'covoit' as const,
        rows: (data ?? []).map(c => ({
          id: c.id as string,
          title: `${c.ville_depart} → ${c.ville_arrivee}`,
          subtitle: c.date_depart ? new Date(c.date_depart as string).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : null,
          photo: null,
        })),
      }
    })())
  }

  // Best-effort : si une source échoue (table inexistante, RLS), on continue.
  const settled = await Promise.allSettled(tasks)
  const results: Array<{ kind: EmbedKind; id: string; title: string; subtitle: string | null; photo: string | null }> = []
  const debug: Record<string, number | string> = {}
  for (const r of settled) {
    if (r.status === 'fulfilled') {
      debug[r.value.kind] = r.value.rows.length
      for (const row of r.value.rows) {
        results.push({ kind: r.value.kind, ...row })
      }
    } else {
      debug[`__error_${Object.keys(debug).length}`] = String(r.reason)
    }
  }

  return NextResponse.json({ results, query: q, debug })
}
