'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ClientPortal from '@/components/ClientPortal'

export type EmbedKind = 'event' | 'etab' | 'producer' | 'annonce' | 'promo' | 'covoit'

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
}

const KIND_LABEL: Record<EmbedKind, string> = {
  event:    'Événements',
  etab:     'Établissements',
  producer: 'Producteurs',
  annonce:  'Annonces',
  promo:    'Promotions',
  covoit:   'Covoiturage',
}

const KIND_COLOR: Record<EmbedKind, { bg: string; color: string }> = {
  event:    { bg: '#E8F2EB', color: '#2D5A3D' },
  etab:     { bg: '#F0EBE3', color: '#7C5C3B' },
  producer: { bg: '#EAF3E6', color: '#5B8A4A' },
  annonce:  { bg: '#FFF0E5', color: '#C84B2F' },
  promo:    { bg: '#FFF0E5', color: '#E8622A' },
  covoit:   { bg: '#E8EEF7', color: '#3A5D8C' },
}

export default function EmbedPicker({ onSelect, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<EmbedItem[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Debounce 250ms
  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setResults([]); setLoading(false); return }
    const res = await fetch(`/api/search/embed?q=${encodeURIComponent(q)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const data = await res.json()
      setResults((data.results as EmbedItem[]) ?? [])
    } else {
      setResults([])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => search(query), 250)
    return () => clearTimeout(t)
  }, [query, search])

  // Groupé par kind pour l'affichage
  const grouped: Partial<Record<EmbedKind, EmbedItem[]>> = {}
  for (const r of results) {
    if (!grouped[r.kind]) grouped[r.kind] = []
    grouped[r.kind]!.push(r)
  }
  const orderedKinds: EmbedKind[] = ['event', 'etab', 'producer', 'annonce', 'promo', 'covoit']

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

          {/* Header search */}
          <div
            className="flex shrink-0 items-center gap-2 px-4 pb-3"
            style={{ borderBottom: '1px solid #F0EAE0' }}
          >
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
                placeholder="Chercher dans le village…"
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
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Résultats */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {query.trim().length < 2 && (
              <p className="px-4 py-8 text-center text-[12px] text-texte-doux">
                Tape au moins 2 caractères pour chercher dans le village (événements, commerces, annonces, etc.).
              </p>
            )}
            {loading && results.length === 0 && (
              <p className="px-4 py-6 text-center text-[12px] text-texte-doux">Recherche…</p>
            )}
            {!loading && query.trim().length >= 2 && results.length === 0 && (
              <p className="px-4 py-6 text-center text-[12px] text-texte-doux">Aucun résultat</p>
            )}

            {orderedKinds.map(kind => {
              const items = grouped[kind] ?? []
              if (items.length === 0) return null
              const c = KIND_COLOR[kind]
              return (
                <section key={kind} className="mb-4">
                  <div
                    className="mb-1.5 inline-block rounded-full px-2 py-[3px] text-[9.5px] font-extrabold uppercase"
                    style={{ background: c.bg, color: c.color, letterSpacing: '0.06em' }}
                  >
                    {KIND_LABEL[kind]}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {items.map(it => (
                      <button
                        key={`${kind}-${it.id}`}
                        type="button"
                        onClick={() => onSelect(it)}
                        className="flex items-center gap-2.5 rounded-[12px] border bg-white px-2.5 py-2 text-left"
                        style={{ borderColor: '#F0EAE0' }}
                      >
                        <div
                          className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[8px]"
                          style={{ background: c.bg, color: c.color }}
                        >
                          {it.photo
                            ? <img src={it.photo} alt="" className="h-full w-full object-cover" />
                            : <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /></svg>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-extrabold text-texte" style={{ letterSpacing: '-0.005em' }}>
                            {it.title}
                          </div>
                          {it.subtitle && <div className="truncate text-[11px] text-texte-doux">{it.subtitle}</div>}
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        </div>
      </div>
    </ClientPortal>
  )
}
