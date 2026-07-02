'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import AnnonceCard from '@/components/AnnonceCard'
import AnnonceFilters, { SortDropdown, type TriOption } from '@/components/AnnonceFilters'
import BottomNavBar from '@/components/BottomNavBar'
import type { Annonce, AnnonceType, AnnonceCategorie } from '@/lib/annonces'

/* Normalise pour la recherche : minuscules + sans accents. */
function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export default function AnnoncesPageClient() {
  const router = useRouter()
  const [type, setType]           = useState<AnnonceType | null>(null)
  const [categorie, setCategorie] = useState<AnnonceCategorie | null>(null)
  const [tri, setTri]             = useState<TriOption>('date_desc')
  const [query, setQuery]         = useState('')
  const [catsOpen, setCatsOpen]   = useState(false)

  // SWR avec clé incluant les filtres serveur (type/categorie/tri) → chaque
  // combinaison a sa propre entrée cache. La recherche texte (`query`) reste
  // client-side : filtrage instantané sur la liste déjà chargée.
  const annoncesKey = useMemo(() => {
    const params = new URLSearchParams()
    if (type)      params.set('type', type)
    if (categorie) params.set('categorie', categorie)
    params.set('tri', tri)
    return `/api/annonces/public?${params.toString()}`
  }, [type, categorie, tri])

  const { data, isLoading: swrLoading } = useSWR(annoncesKey)
  const annonces = useMemo<Annonce[]>(() => (data?.annonces ?? []) as Annonce[], [data])
  const loading = swrLoading && !data

  // Recherche texte client-side : titre + description + ville.
  const filtered = useMemo(() => {
    const q = norm(query.trim())
    if (!q) return annonces
    return annonces.filter(a =>
      norm(`${a.titre} ${a.description ?? ''} ${a.ville ?? ''}`).includes(q)
    )
  }, [annonces, query])

  const sponsored = useMemo(() => filtered.filter(a => a.sponsored), [filtered])
  const standard  = useMemo(() => filtered.filter(a => !a.sponsored), [filtered])
  const hasEnchere = filtered.some(a => a.type === 'enchere_inversee')

  return (
    <div className="min-h-[100dvh] bg-creme pb-20 font-inter text-texte">
      <style>{`.pdv-hscroll { scrollbar-width: none; -webkit-overflow-scrolling: touch; } .pdv-hscroll::-webkit-scrollbar { display: none; }`}</style>

      {/* ─────────── Top bar : back · titre · messages + créer ─────────── */}
      <div className="flex items-center justify-between gap-2.5 px-4 pt-3.5">
        <button
          onClick={() => router.push('/')}
          aria-label="Retour"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-bord bg-white text-texte shadow-[0_1px_2px_rgba(44,28,16,0.04)]"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>

        <div className="flex min-w-0 flex-1 flex-col items-center gap-px">
          <div className="flex items-center gap-1.5 font-serif text-[20px] leading-none text-texte" style={{ letterSpacing: '-0.01em' }}>
            Annonces
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2D5A3D" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/>
              <path d="M2 21c0-3 1.85-5.36 5.08-6"/>
            </svg>
          </div>
          <div className="text-[12px] font-semibold text-texte-doux">Le coin du village</div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/annonces/messages"
            aria-label="Mes messages"
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-bord bg-white text-texte no-underline shadow-[0_1px_2px_rgba(44,28,16,0.04)]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
            </svg>
          </Link>
          {/* + Publier une annonce (déplacé depuis la bottom nav) */}
          <Link
            href="/annonces/nouvelle"
            aria-label="Publier une annonce"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white no-underline"
            style={{ background: 'linear-gradient(135deg, #3C7A50, #2D5A3D)', boxShadow: '0 2px 6px rgba(45,90,61,0.30)' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </Link>
        </div>
      </div>

      {/* ─────────── Barre de recherche + bouton Filtres ─────────── */}
      <div className="px-4 pt-4">
        <div className="flex items-center gap-1 rounded-2xl border border-bord bg-white px-3.5 py-1 shadow-[0_1px_4px_rgba(44,28,16,0.05)]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9A8A78" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <circle cx="11" cy="11" r="7"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Que recherchez-vous ?"
            className="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-[14px] text-texte outline-none placeholder:text-texte-tres-doux"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Effacer la recherche"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-texte-doux"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
          <div className="mx-1 h-6 w-px shrink-0 bg-bord" aria-hidden />
          <button
            type="button"
            onClick={() => setCatsOpen(o => !o)}
            className="inline-flex shrink-0 items-center gap-1.5 py-2 text-[13px] font-bold text-texte"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="11" y2="6"/><line x1="14" y1="6" x2="20" y2="6"/>
              <line x1="4" y1="12" x2="7" y2="12"/><line x1="10" y1="12" x2="20" y2="12"/>
              <line x1="4" y1="18" x2="14" y2="18"/><line x1="17" y1="18" x2="20" y2="18"/>
              <circle cx="12.5" cy="6" r="2"/><circle cx="8.5" cy="12" r="2"/><circle cx="15.5" cy="18" r="2"/>
            </svg>
            Filtres
            {categorie && (
              <span className="inline-flex h-[14px] min-w-[16px] items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-extrabold leading-none text-white">1</span>
            )}
          </button>
        </div>
      </div>

      {/* ─────────── Pills de type + catégories ─────────── */}
      <AnnonceFilters
        type={type}
        categorie={categorie}
        catsOpen={catsOpen}
        onTypeChange={setType}
        onCategorieChange={setCategorie}
      />

      {/* ─────────── Titre section + tri ─────────── */}
      <div className="flex items-center justify-between px-4 pb-1 pt-4">
        <h2 className="m-0 font-serif text-[18px] font-bold leading-none text-texte" style={{ letterSpacing: '-0.01em' }}>
          Dernières annonces
        </h2>
        <SortDropdown current={tri} onChange={setTri} />
      </div>

      {/* ─────────── Liste en lignes ─────────── */}
      <div className="px-4 pt-2">
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="h-7 w-7 animate-spin rounded-full border-4 border-bord border-t-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-14 text-center">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#C8B8A8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <line x1="9" y1="9" x2="15" y2="9"/>
              <line x1="9" y1="13" x2="15" y2="13"/>
              <line x1="9" y1="17" x2="13" y2="17"/>
            </svg>
            <p className="m-0 text-[14px] font-bold text-texte-doux">
              {query ? 'Aucune annonce pour cette recherche.' : 'Aucune annonce ne correspond.'}
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2.5">
              {sponsored.map(a => <AnnonceCard key={a.id} annonce={a} />)}
              {standard.map(a => <AnnonceCard key={a.id} annonce={a} />)}
            </div>
            {hasEnchere && <EnchereExplainCard />}
          </>
        )}
      </div>

      <BottomNavBar />
    </div>
  )
}

function EnchereExplainCard() {
  return (
    <div className="mt-4">
      <div
        className="flex items-center gap-3 rounded-[14px] border px-3.5 py-3"
        style={{ backgroundColor: '#FFF0E5', borderColor: '#F5C8A8' }}
      >
        <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-white text-accent">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/>
            <polyline points="16 17 22 17 22 11"/>
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-extrabold leading-[1.2] text-accent">Enchères à l&apos;envers</div>
          <p className="mt-0.5 text-[11px] leading-[1.4] text-texte-doux">
            Le prix baisse chaque jour. Plus tu attends, moins c&apos;est cher — mais quelqu&apos;un peut t&apos;avoir devancé.
          </p>
        </div>
      </div>
    </div>
  )
}
