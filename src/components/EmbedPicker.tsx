'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ClientPortal from '@/components/ClientPortal'

export type EmbedKind = 'event' | 'etab' | 'producer' | 'annonce' | 'promo' | 'covoit' | 'article' | 'debat'

export interface EmbedItem {
  kind:     EmbedKind
  id:       string
  title:    string
  subtitle: string | null
  photo:    string | null
}

interface Props {
  onSelect: (embed: EmbedItem) => void
  onClose:  () => void
  /** Verrouille le picker sur un seul type (ex: 'event') : pas de grille de
   *  catégories, recherche directe dans ce type. */
  lockKind?: EmbedKind
}

const KIND_LABEL: Record<EmbedKind, string> = {
  event:    'Événements',
  etab:     'Établissements',
  producer: 'Producteurs',
  annonce:  'Annonces',
  promo:    'Promotions',
  covoit:   'Covoiturages',
  article:  'Journal',
  debat:    'Débats',
}

/** Couleurs par kind (badge + fond tuile catégorie) */
const KIND_COLOR: Record<EmbedKind, { bg: string; color: string; tile: string }> = {
  event:    { bg: '#E8F2EB', color: '#2D5A3D', tile: 'linear-gradient(135deg, #E8F2EB 0%, #C8DEC0 100%)' },
  etab:     { bg: '#F0EBE3', color: '#7C5C3B', tile: 'linear-gradient(135deg, #F5EFE6 0%, #E2D5C2 100%)' },
  producer: { bg: '#EAF3E6', color: '#5B8A4A', tile: 'linear-gradient(135deg, #EAF3E6 0%, #C6E0B7 100%)' },
  annonce:  { bg: '#FFF0E5', color: '#C84B2F', tile: 'linear-gradient(135deg, #FFE9DA 0%, #FFD0AE 100%)' },
  promo:    { bg: '#FFF0E5', color: '#E8622A', tile: 'linear-gradient(135deg, #FFE6CC 0%, #FFC79A 100%)' },
  covoit:   { bg: '#E8EEF7', color: '#3A5D8C', tile: 'linear-gradient(135deg, #E8EEF7 0%, #BFD0EC 100%)' },
  article:  { bg: '#FBF3E6', color: '#A8770F', tile: 'linear-gradient(135deg, #FBF3E6 0%, #ECD9AE 100%)' },
  debat:    { bg: '#EDE9F7', color: '#5B4B9C', tile: 'linear-gradient(135deg, #EDE9F7 0%, #D2C8EE 100%)' },
}

/** Pictos SVG par kind pour les tuiles catégorie (grand format) */
function CatIcon({ kind, size = 36 }: { kind: EmbedKind; size?: number }) {
  const props = {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none', stroke: 'currentColor', strokeWidth: 1.6,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  }
  switch (kind) {
    case 'event':    return <svg {...props}><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/></svg>
    case 'etab':     return <svg {...props}><path d="M3 21V8l9-5 9 5v13"/><path d="M9 21V12h6v9"/></svg>
    case 'producer': return <svg {...props}><path d="M12 2v6"/><path d="M12 22a8 8 0 0 1-8-8c0-2.5 1.5-5 4-6"/><path d="M12 22a8 8 0 0 0 8-8c0-2.5-1.5-5-4-6"/></svg>
    case 'annonce':  return <svg {...props}><path d="M16 6l-4-4-4 4"/><path d="M12 2v14"/><rect x="4" y="14" width="16" height="8" rx="2"/></svg>
    case 'promo':    return <svg {...props}><path d="M20 12V8H4v4"/><path d="M20 12v8H4v-8"/><line x1="12" y1="8" x2="12" y2="20"/><path d="M8 8a2 2 0 0 1 2-4c1.5 0 2 2 2 4-2 0-4 0-4-2 0-2 2-2 2-2"/></svg>
    case 'covoit':   return <svg {...props}><circle cx="6" cy="17" r="2"/><circle cx="18" cy="17" r="2"/><path d="M3 17h2m12 0h2M5 17l1-5h12l2 5"/><path d="M7 12l1-3h8l1 3"/></svg>
    case 'article':  return <svg {...props}><path d="M4 4h12a2 2 0 0 1 2 2v13a1 1 0 0 1-1 1H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M18 8h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2"/><line x1="6" y1="8" x2="14" y2="8"/><line x1="6" y1="12" x2="14" y2="12"/><line x1="6" y1="16" x2="11" y2="16"/></svg>
    case 'debat':    return <svg {...props}><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-4-.9L3 21l1.9-4.6A8.4 8.4 0 0 1 4 11.5 8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5z"/><line x1="9" y1="10" x2="16" y2="10"/><line x1="9" y1="14" x2="13" y2="14"/></svg>
  }
}

const ORDERED_KINDS: EmbedKind[] = ['event', 'etab', 'producer', 'annonce', 'promo', 'covoit', 'article', 'debat']

export default function EmbedPicker({ onSelect, onClose, lockKind }: Props) {
  const [query, setQuery]             = useState('')
  const [selectedKind, setSelectedKind] = useState<EmbedKind | null>(lockKind ?? null)
  const [results, setResults]         = useState<EmbedItem[]>([])
  const [loading, setLoading]         = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // ESC pour fermer (ou revenir au niveau supérieur)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedKind !== null && !lockKind) setSelectedKind(null)
        else onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, selectedKind, lockKind])

  // Focus input quand on entre dans une catégorie ou que l'user veut taper
  useEffect(() => {
    if (selectedKind !== null) {
      const t = setTimeout(() => inputRef.current?.focus(), 80)
      return () => clearTimeout(t)
    }
  }, [selectedKind])

  // Fetch : trois modes
  //  - Recherche libre (query >= 2) sur toutes les cat → multi-source
  //  - Recherche dans une catégorie (selectedKind + query >= 2) → kind unique filtré
  //  - Browse catégorie (selectedKind, query vide) → liste récente du kind seul
  const search = useCallback(async () => {
    const q = query.trim()
    // Niveau "catégories" sans query → rien à fetch
    if (selectedKind === null && q.length < 2) {
      setResults([])
      return
    }
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setResults([]); setLoading(false); return }

    const params = new URLSearchParams()
    if (q.length >= 2) params.set('q', q)
    if (selectedKind !== null) params.set('kinds', selectedKind)

    const res = await fetch(`/api/search/embed?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const data = await res.json()
      setResults((data.results as EmbedItem[]) ?? [])
    } else {
      setResults([])
    }
    setLoading(false)
  }, [query, selectedKind])

  // Debounce 250ms sur (query, selectedKind)
  useEffect(() => {
    const t = setTimeout(() => search(), 250)
    return () => clearTimeout(t)
  }, [query, selectedKind, search])

  // Grouper par kind pour l'affichage multi-cat (recherche globale)
  const grouped: Partial<Record<EmbedKind, EmbedItem[]>> = {}
  for (const r of results) {
    if (!grouped[r.kind]) grouped[r.kind] = []
    grouped[r.kind]!.push(r)
  }

  // ── Vue ROOT : grille de catégories cliquables ──
  const isRoot = selectedKind === null && query.trim().length < 2

  return (
    <ClientPortal>
      <div
        className="fixed inset-0 z-[3800] flex items-end justify-center bg-black/55 backdrop-blur-[3px] font-inter"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
      >
        <div
          onClick={e => e.stopPropagation()}
          className="flex w-full max-w-[480px] flex-col rounded-t-3xl bg-white"
          style={{ maxHeight: '85dvh', paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))' }}
        >
          <div className="mx-auto mt-3 mb-3 h-[5px] w-11 shrink-0 rounded-[3px] bg-[#E4DED2]" />

          {/* Header : back si selectedKind, sinon "Partager", + search input */}
          <div
            className="flex shrink-0 items-center gap-2 px-4 pb-3"
            style={{ borderBottom: '1px solid #F0EAE0' }}
          >
            {selectedKind !== null && !lockKind && (
              <button
                type="button"
                onClick={() => { setSelectedKind(null); setQuery('') }}
                aria-label="Retour aux catégories"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border bg-white text-texte"
                style={{ borderColor: '#E8E0D4' }}
              >
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                </svg>
              </button>
            )}
            <div
              className="flex flex-1 items-center gap-2.5 rounded-[14px] border bg-white px-3.5 py-[11px]"
              style={{ borderColor: '#E8E0D4' }}
            >
              <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="#7A6A5A" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <line x1="16.5" y1="16.5" x2="21" y2="21" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={
                  selectedKind !== null
                    ? `Rechercher dans ${KIND_LABEL[selectedKind].toLowerCase()}…`
                    : 'Chercher partout dans le village…'
                }
                className="flex-1 bg-transparent text-[13px] font-medium text-texte placeholder:text-texte-tres-doux focus:outline-none"
                style={{ colorScheme: 'light' }}
              />
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="flex h-9 w-9 items-center justify-center bg-transparent text-texte-doux"
            >
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Contenu scrollable */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {/* ──── Vue racine : grille de catégories (compacte, 3 col) ──── */}
            {isRoot && (
              <div className="grid grid-cols-3 gap-2">
                {ORDERED_KINDS.map(kind => {
                  const c = KIND_COLOR[kind]
                  return (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setSelectedKind(kind)}
                      className="flex flex-col items-center justify-center gap-1.5 rounded-[12px] p-2"
                      style={{
                        background: c.tile,
                        color: c.color,
                        minHeight: 78,
                        WebkitTapHighlightColor: 'transparent',
                      }}
                    >
                      <CatIcon kind={kind} size={22} />
                      <div className="text-center text-[11px] font-bold leading-[1.15]" style={{ color: '#1A1209', letterSpacing: '-0.003em' }}>
                        {KIND_LABEL[kind]}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {/* ──── Loading ──── */}
            {!isRoot && loading && results.length === 0 && (
              <p className="px-4 py-8 text-center text-[12px] text-texte-doux">Chargement…</p>
            )}

            {/* ──── Pas de résultats ──── */}
            {!isRoot && !loading && results.length === 0 && (
              <p className="px-4 py-8 text-center text-[12px] text-texte-doux">
                {query.trim().length >= 2 ? 'Aucun résultat' : 'Rien à afficher'}
              </p>
            )}

            {/* ──── Liste mono-catégorie (selectedKind défini) ──── */}
            {selectedKind !== null && results.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {results.map(it => (
                  <ItemRow key={`${it.kind}-${it.id}`} item={it} onSelect={onSelect} />
                ))}
              </div>
            )}

            {/* ──── Résultats multi-cat (recherche globale depuis racine) ──── */}
            {selectedKind === null && query.trim().length >= 2 && (
              <>
                {ORDERED_KINDS.map(kind => {
                  const items = grouped[kind] ?? []
                  if (items.length === 0) return null
                  const c = KIND_COLOR[kind]
                  return (
                    <section key={kind} className="mb-4">
                      <button
                        type="button"
                        onClick={() => { setSelectedKind(kind); setQuery('') }}
                        className="mb-1.5 inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[9.5px] font-extrabold uppercase"
                        style={{ background: c.bg, color: c.color, letterSpacing: '0.06em' }}
                        aria-label={`Voir tous les ${KIND_LABEL[kind].toLowerCase()}`}
                      >
                        {KIND_LABEL[kind]}
                        <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 6 15 12 9 18" />
                        </svg>
                      </button>
                      <div className="flex flex-col gap-1.5">
                        {items.map(it => (
                          <ItemRow key={`${it.kind}-${it.id}`} item={it} onSelect={onSelect} />
                        ))}
                      </div>
                    </section>
                  )
                })}
              </>
            )}
          </div>
        </div>
      </div>
    </ClientPortal>
  )
}

/* ── Row item (réutilisé en recherche globale + mono-catégorie) ─────── */
function ItemRow({ item, onSelect }: { item: EmbedItem; onSelect: (e: EmbedItem) => void }) {
  const c = KIND_COLOR[item.kind]
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="flex items-center gap-2.5 rounded-[12px] border bg-white px-2.5 py-2 text-left"
      style={{ borderColor: '#F0EAE0' }}
    >
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[9px]"
        style={{ background: c.bg, color: c.color }}
      >
        {item.photo
          ? <img src={item.photo} alt="" className="h-full w-full object-cover" />
          : <CatIcon kind={item.kind} size={18} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-extrabold text-texte" style={{ letterSpacing: '-0.005em' }}>
          {item.title}
        </div>
        {item.subtitle && (
          <div className="truncate text-[11px] text-texte-doux">{item.subtitle}</div>
        )}
      </div>
      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#C4B8A8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 6 15 12 9 18" />
      </svg>
    </button>
  )
}
