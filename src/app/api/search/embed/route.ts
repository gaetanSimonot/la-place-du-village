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
      // Aucun filtre statut → on remonte toutes les annonces. Si tu veux
      // restreindre, ajoute un .in('statut', [...]) ici. Pour le moment
      // on laisse ouvert pour que rien ne soit caché.
      let qb = supabaseAdmin
        .from('annonces')
        .select('id, titre, photos, prix, statut, type')
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
      // Aucun filtre actif/valid_until — on remonte tout. À filtrer après
      // si l'utilisateur veut exclure les promos expirées du picker.
      let qb = supabaseAdmin
        .from('promotions')
        .select('id, titre, image_url')
      if (ilike) qb = qb.ilike('titre', ilike)
      const { data } = await qb.order('created_at', { ascending: false }).limit(LIMIT)
      return {
        kind: 'promo' as const,
        rows: (data ?? []).map(p => ({
          id: p.id as string,
          title: p.titre as string,
          subtitle: null,
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
  for (const r of settled) {
    if (r.status === 'fulfilled') {
      for (const row of r.value.rows) {
        results.push({ kind: r.value.kind, ...row })
      }
    }
  }

  return NextResponse.json({ results, query: q })
}
