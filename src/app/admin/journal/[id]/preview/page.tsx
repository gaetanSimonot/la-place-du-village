'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import JournalPageClient, {
  type JournalRow, type EventEntry, type AnnonceEntry, type PromoEntry,
  type SpotlightEntry, type ArticleEntry, type ArchiveEntry,
} from '@/app/journal/[numero]/client'

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function JournalPreviewPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id ?? ''
  const [row, setRow] = useState<JournalRow | null>(null)
  const [events, setEvents] = useState<EventEntry[]>([])
  const [annonces, setAnnonces] = useState<AnnonceEntry[]>([])
  const [promos, setPromos] = useState<PromoEntry[]>([])
  const [articles, setArticles] = useState<ArticleEntry[]>([])
  const [spotlight, setSpotlight] = useState<SpotlightEntry | null>(null)
  const [archives, setArchives] = useState<ArchiveEntry[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      try {
        // 1. Journal complet via API admin (autorise brouillons)
        const headers = await authHeaders()
        const jRes = await fetch(`/api/admin/journal/${id}`, { headers })
        const jData = await jRes.json()
        if (!jRes.ok) throw new Error(jData.error || 'Erreur chargement')
        const j = jData.journal as JournalRow
        if (cancelled) return
        setRow(j)

        // 2. Entités liées en parallèle (anon supabase suffit, tout est public)
        const evIds  = (j.selection_event_ids   ?? []) as string[]
        const annIds = (j.selection_annonce_ids ?? []) as string[]
        const proIds = (j.selection_bonplan_ids ?? []) as string[]

        const [eventsRes, annoncesRes, promosRes, articleRes, spotRes, archRes] = await Promise.all([
          evIds.length > 0
            ? supabase.from('evenements').select('id, titre, image_url, date_debut, heure, categorie, lieux(nom, commune)').in('id', evIds)
            : Promise.resolve({ data: [] }),
          annIds.length > 0
            ? supabase.from('annonces').select('id, titre, description, photos, type, prix_initial, prix_actuel, ville').in('id', annIds)
            : Promise.resolve({ data: [] }),
          proIds.length > 0
            ? supabase.from('promotions').select('id, title, description, image_url, etablissement_id, etablissements(nom, commune)').in('id', proIds)
            : Promise.resolve({ data: [] }),
          // Tous les articles du numéro (relation journal_id)
          supabase.from('articles_journal')
            .select('id, titre, corps, photo_url, user_id, created_at')
            .eq('journal_id', id)
            .in('statut', ['publie', 'valide'])
            .order('created_at', { ascending: true }),
          j.spotlight_etab_id
            ? (j.spotlight_kind === 'producteur'
                ? supabase.from('producers').select('id, nom, commune, photos, description_courte').eq('id', j.spotlight_etab_id).maybeSingle()
                : supabase.from('etablissements').select('id, nom, commune, type, photos, description_courte').eq('id', j.spotlight_etab_id).maybeSingle()
              )
            : Promise.resolve({ data: null }),
          supabase
            .from('journaux_hebdo')
            .select('numero, cover_titre, date_parution')
            .eq('statut', 'publie')
            .lt('numero', j.numero)
            .order('numero', { ascending: false })
            .limit(6),
        ])

        if (cancelled) return

        const order = <T extends { id: string }>(rows: T[], ids: string[]): T[] => {
          const map = Object.fromEntries(rows.map(r => [r.id, r]))
          return ids.map(idx => map[idx]).filter(Boolean)
        }

        setEvents(order((eventsRes.data ?? []) as unknown as EventEntry[], evIds))
        setAnnonces(order((annoncesRes.data ?? []) as AnnonceEntry[], annIds))
        setPromos(order((promosRes.data ?? []) as unknown as PromoEntry[], proIds))
        {
          const arr = (articleRes.data as ArticleEntry[] | null) ?? []
          setArticles([...arr].sort((a, b) =>
            a.id === j.selection_article_id ? -1 : b.id === j.selection_article_id ? 1 : 0,
          ))
        }
        const spotRaw = spotRes.data as Omit<SpotlightEntry, 'kind' | 'type'> & { type?: string | null } | null
        setSpotlight(spotRaw ? {
          id: spotRaw.id,
          nom: spotRaw.nom,
          commune: spotRaw.commune,
          photos: spotRaw.photos,
          description_courte: spotRaw.description_courte,
          type: spotRaw.type ?? null,
          kind: (j.spotlight_kind ?? 'etablissement') as 'etablissement' | 'producteur',
        } : null)
        setArchives((archRes.data ?? []) as ArchiveEntry[])
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erreur')
      }
    })()
    return () => { cancelled = true }
  }, [id])

  if (error) {
    return (
      <main className="min-h-screen bg-creme p-6 font-inter">
        <Link href="/admin/journal" className="text-[12px] font-semibold text-primary">← Journal</Link>
        <p className="mt-4 rounded-[12px] border border-accent bg-[#FFF0E5] px-4 py-3 text-[13px] text-accent">
          {error}
        </p>
      </main>
    )
  }
  if (!row) {
    return (
      <main className="min-h-screen bg-creme p-6 font-inter">
        <p className="text-texte-doux">Chargement preview…</p>
      </main>
    )
  }

  return (
    <>
      {/* Bandeau preview admin (sticky) */}
      <div
        className="sticky top-0 z-50 flex items-center justify-between gap-3 bg-accent px-4 py-2 text-white"
        style={{ fontFamily: 'Inter, sans-serif' }}
      >
        <span className="text-[11px] font-extrabold tracking-[0.12em]">
          APERÇU ADMIN · {row.statut === 'publie' ? 'PUBLIÉ' : 'BROUILLON'}
        </span>
        <Link
          href={`/admin/journal/${id}`}
          className="rounded-md bg-white/15 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-white/25"
        >
          ← Éditer
        </Link>
      </div>
      <JournalPageClient
        row={row}
        archives={archives}
        events={events}
        annonces={annonces}
        promos={promos}
        articles={articles}
        spotlight={spotlight}
      />
    </>
  )
}
