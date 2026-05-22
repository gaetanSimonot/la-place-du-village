import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
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

  if (q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const ilike = `%${q.replace(/%/g, '\\%')}%`
  const LIMIT = 8

  type Task = Promise<{ kind: EmbedKind; rows: Array<{ id: string; title: string; subtitle: string | null; photo: string | null }> }>
  const tasks: Task[] = []

  if (requested.includes('event')) {
    tasks.push((async () => {
      const { data } = await supabase
        .from('evenements')
        .select('id, titre, image_url, date_debut, lieux(commune)')
        .eq('statut', 'publie')
        .ilike('titre', ilike)
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
      const { data } = await supabase
        .from('etablissements')
        .select('id, nom, commune, photos')
        .ilike('nom', ilike)
        .limit(LIMIT)
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
      const { data } = await supabase
        .from('producers')
        .select('id, nom, commune, photos')
        .ilike('nom', ilike)
        .limit(LIMIT)
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
      const { data } = await supabase
        .from('annonces')
        .select('id, titre, photos, prix, statut, type')
        .eq('statut', 'active')
        .ilike('titre', ilike)
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
      const { data } = await supabase
        .from('promotions')
        .select('id, titre, image_url')
        .ilike('titre', ilike)
        .limit(LIMIT)
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
      const { data } = await supabase
        .from('covoit_trajets')
        .select('id, ville_depart, ville_arrivee, date_depart')
        .or(`ville_depart.ilike.${ilike},ville_arrivee.ilike.${ilike}`)
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
