import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

export type EmbedKind = 'event' | 'etab' | 'producer' | 'annonce' | 'promo' | 'covoit' | 'article'

function articleExcerpt(t: string | null, n = 90): string | null {
  if (!t) return null
  const s = String(t).replace(/<[^>]+>/g, ' ').replace(/[#*_>`]/g, ' ').replace(/\s+/g, ' ').trim()
  return s ? (s.length > n ? s.slice(0, n).trimEnd() + '…' : s) : null
}

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
    ? (kindsParam.split(',').filter(k => ['event','etab','producer','annonce','promo','covoit','article'].includes(k)) as EmbedKind[])
    : ['event','etab','producer','annonce','promo','covoit','article']

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
        .select('id, titre, image_url, date_debut, heure, lieux(commune)')
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
          // Subtitle = date courte + (heure si dispo) · commune
          let dateLabel: string | null = null
          if (e.date_debut) {
            const d = new Date(e.date_debut as string)
            const today = new Date(); today.setHours(0, 0, 0, 0)
            const ref = new Date(d); ref.setHours(0, 0, 0, 0)
            const diffDays = Math.round((ref.getTime() - today.getTime()) / 86400000)
            if (diffDays === 0)        dateLabel = "Aujourd'hui"
            else if (diffDays === 1)   dateLabel = 'Demain'
            else if (diffDays > 1 && diffDays < 7) dateLabel = d.toLocaleDateString('fr-FR', { weekday: 'long' })
            else                       dateLabel = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
          }
          const heureLabel = e.heure ? String(e.heure).slice(0, 5) : null
          const parts: string[] = []
          if (dateLabel) parts.push(heureLabel ? `${dateLabel} · ${heureLabel}` : dateLabel)
          if (lieu?.commune) parts.push(lieu.commune)
          return {
            id: e.id as string,
            title: e.titre as string,
            subtitle: parts.length ? parts.join(' · ') : null,
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
      // ATTENTION : la table 'annonces' n'a PAS de colonne 'prix' — elle a
      // 'prix_initial' (et 'prix_seuil' pour enchères inversées). Référence
      // /api/annonces POST insert : .insert({ titre, prix_initial, ... }).
      let qb = supabaseAdmin
        .from('annonces')
        .select('id, titre, photos, prix_initial, statut, type, categorie')
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
          subtitle: (a.categorie as string | null) ?? (a.type as string | null) ?? null,
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
      // ATTENTION : table 'covoiturages' (avec un 's') et colonnes
      // 'depart', 'destination', 'date_trajet', 'heure_depart' (pas
      // ville_depart/ville_arrivee/date_depart). Vérifié /api/covoiturages.
      let qb = supabaseAdmin
        .from('covoiturages')
        .select('id, depart, destination, date_trajet, heure_depart')
      if (ilike) qb = qb.or(`depart.ilike.${ilike},destination.ilike.${ilike}`)
      const { data } = await qb
        .order('date_trajet', { ascending: true })
        .limit(LIMIT)
      return {
        kind: 'covoit' as const,
        rows: (data ?? []).map(c => ({
          id: c.id as string,
          title: `${c.depart} → ${c.destination}`,
          subtitle: c.date_trajet ? new Date(c.date_trajet as string).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : null,
          photo: null,
        })),
      }
    })())
  }

  if (requested.includes('article')) {
    tasks.push((async () => {
      let qb = supabaseAdmin.from('articles_journal').select('id, titre, corps, photo_url').eq('statut', 'publie')
      if (ilike) qb = qb.ilike('titre', ilike)
      const { data } = await qb.order('created_at', { ascending: false }).limit(LIMIT)
      return {
        kind: 'article' as const,
        rows: (data ?? []).map(a => ({
          id: a.id as string,
          title: (a.titre as string) ?? 'Article',
          subtitle: articleExcerpt(a.corps as string | null),
          photo: (a.photo_url as string | null) ?? null,
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
