'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import BottomNavBar from '@/components/BottomNavBar'
import PersonCard, { type PersonCardData } from '@/components/PersonCard'

type Filter = 'all' | 'friends'

const PAGE_LIMIT = 200

export default function PeopleClient() {
  const [people, setPeople]     = useState<PersonCardData[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [filter, setFilter]     = useState<Filter>('all')

  // ──────────────────────────────────────────────────────────────────────
  // Fetch BROWSE (search vide) — lit la VUE profiles_public_listing.
  // is_public=true AND banned=false enforced au niveau de la vue → impossible
  // qu'un profil privé apparaisse, peu importe la query.
  // ──────────────────────────────────────────────────────────────────────
  const loadBrowse = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles_public_listing')
      .select('user_id, display_name, avatar_url, ville, genre, is_verified')
      .order('display_name', { ascending: true, nullsFirst: false })
      .limit(PAGE_LIMIT)
    if (error) console.error('[people] browse error:', error.message)
    setPeople((data as PersonCardData[] | null) ?? [])
    setLoading(false)
  }, [])

  // ──────────────────────────────────────────────────────────────────────
  // Fetch SEARCH (search.length >= 2) — lit la VUE profiles_searchable.
  // searchable=true AND banned=false enforced au niveau de la vue → impossible
  // qu'un profil non-searchable soit trouvé via cette page.
  // ──────────────────────────────────────────────────────────────────────
  const loadSearch = useCallback(async (q: string) => {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles_searchable')
      .select('user_id, display_name, avatar_url, ville')
      .or(`display_name.ilike.%${q}%,ville.ilike.%${q}%`)
      .order('display_name', { ascending: true, nullsFirst: false })
      .limit(PAGE_LIMIT)
    if (error) console.error('[people] search error:', error.message)
    setPeople((data as PersonCardData[] | null) ?? [])
    setLoading(false)
  }, [])

  // Debounce sur search (250ms) — évite de saturer la DB à chaque keystroke
  useEffect(() => {
    const q = search.trim()
    const t = setTimeout(() => {
      if (q.length === 0) loadBrowse()
      else if (q.length >= 2) loadSearch(q)
      // q.length === 1 → ne fait rien (évite trop de matches)
    }, 250)
    return () => clearTimeout(t)
  }, [search, loadBrowse, loadSearch])

  const visible = useMemo(() => {
    // Filtre "Mes amis" pas encore branché → empty si sélectionné
    if (filter === 'friends') return []
    return people
  }, [people, filter])

  return (
    <main className="min-h-[100dvh] bg-creme pb-28 font-inter text-texte">
      {/* ─── Top bar ────────────────────────────────────── */}
      <div className="sticky top-0 z-30 flex items-center justify-between gap-2.5 border-b border-bordSoft bg-creme/95 px-4 py-3 backdrop-blur">
        <Link
          href="/"
          aria-label="Retour"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-bord bg-white text-texte"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <div className="font-serif text-[17px] leading-none text-texte" style={{ letterSpacing: '-0.01em' }}>
            Les gens
          </div>
          <div className="mt-0.5 text-[10.5px] font-medium text-texte-doux">
            {loading
              ? '…'
              : filter === 'friends'
                ? 'Bientôt'
                : `${people.length} membre${people.length > 1 ? 's' : ''}`}
          </div>
        </div>
        <div className="h-10 w-10 shrink-0" /> {/* spacer pour centrer le titre */}
      </div>

      {/* ─── Recherche ──────────────────────────────────── */}
      <div className="px-4 pt-3">
        <div className="flex items-center gap-2 rounded-xl border border-bord bg-white px-3 py-2.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7A6A5A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un nom ou une ville…"
            className="min-w-0 flex-1 border-none bg-transparent text-[14px] text-texte outline-none placeholder:text-texte-tres-doux"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label="Effacer"
              className="shrink-0 text-texte-tres-doux text-[14px]"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ─── Filtres (chips) ────────────────────────────── */}
      <div className="flex gap-1.5 px-4 pt-3">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`rounded-full border px-3 py-1.5 text-[12px] font-bold transition-colors ${
            filter === 'all' ? 'border-primary bg-primary text-white' : 'border-bord bg-white text-texte'
          }`}
        >
          Tous
        </button>
        <button
          type="button"
          onClick={() => setFilter('friends')}
          disabled
          title="Bientôt — système d'amis à venir"
          className="cursor-not-allowed rounded-full border border-bord bg-white px-3 py-1.5 text-[12px] font-bold text-texte-tres-doux opacity-60"
        >
          Mes amis
          <span className="ml-1 text-[9px] font-extrabold uppercase tracking-[0.04em] text-texte-doux">Bientôt</span>
        </button>
      </div>

      {/* ─── Liste ──────────────────────────────────────── */}
      <div className="mt-3 flex flex-col gap-2 px-4">
        {loading && people.length === 0 && (
          <p className="py-6 text-center text-[12px] text-texte-doux">Chargement…</p>
        )}
        {!loading && visible.length === 0 && filter === 'all' && (
          <div className="rounded-2xl border border-bordSoft bg-white p-6 text-center">
            <p className="m-0 mb-1 text-[14px] font-bold text-texte">
              {search.trim() ? 'Aucun résultat' : 'Aucun membre public pour l\'instant'}
            </p>
            <p className="m-0 text-[12px] text-texte-doux">
              {search.trim() ? 'Essaie un autre nom ou ville.' : 'Reviens plus tard.'}
            </p>
          </div>
        )}
        {!loading && visible.length === 0 && filter === 'friends' && (
          <div className="rounded-2xl border border-bordSoft bg-white p-6 text-center">
            <p className="m-0 mb-1 text-[14px] font-bold text-texte">Bientôt</p>
            <p className="m-0 text-[12px] text-texte-doux">
              Le système d&apos;amis arrive très bientôt. Tu pourras envoyer des demandes et retrouver tes contacts ici.
            </p>
          </div>
        )}
        {visible.map(p => <PersonCard key={p.user_id} p={p} />)}
      </div>

      <BottomNavBar />
    </main>
  )
}
