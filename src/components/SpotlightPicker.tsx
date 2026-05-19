'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type SpotlightKind = 'etablissement' | 'producteur'

export interface SpotlightValue {
  kind: SpotlightKind
  id: string
}

interface ResultItem {
  kind: SpotlightKind
  id: string
  nom: string
  commune: string | null
  photo: string | null
  type: string | null
}

interface Props {
  value: SpotlightValue | null
  onChange: (v: SpotlightValue | null) => void
}

export default function SpotlightPicker({ value, onChange }: Props) {
  const [current, setCurrent] = useState<ResultItem | null>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ResultItem[]>([])
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Charge la fiche actuelle (affichée hors picker)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!value) { setCurrent(null); return }
      const tbl = value.kind === 'etablissement' ? 'etablissements' : 'producers'
      const { data } = await supabase
        .from(tbl)
        .select('id, nom, commune, photos, type')
        .eq('id', value.id)
        .maybeSingle()
      if (cancelled || !data) return
      const d = data as { id: string; nom: string; commune: string | null; photos: string[] | null; type: string | null }
      setCurrent({
        kind: value.kind,
        id: d.id,
        nom: d.nom,
        commune: d.commune,
        photo: d.photos?.[0] ?? null,
        type: d.type,
      })
    })()
    return () => { cancelled = true }
  }, [value])

  // Search debounce
  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim() || query.trim().length < 2) {
      setResults([])
      return
    }
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      const like = `%${query.trim()}%`
      const [etabs, prods] = await Promise.all([
        supabase
          .from('etablissements')
          .select('id, nom, commune, photos, type')
          .or(`nom.ilike.${like},commune.ilike.${like}`)
          .limit(8),
        supabase
          .from('producers')
          .select('id, nom, commune, photos')
          .or(`nom.ilike.${like},commune.ilike.${like}`)
          .limit(8),
      ])
      const items: ResultItem[] = []
      for (const e of (etabs.data ?? []) as Array<{ id: string; nom: string; commune: string | null; photos: string[] | null; type: string | null }>) {
        items.push({ kind: 'etablissement', id: e.id, nom: e.nom, commune: e.commune, photo: e.photos?.[0] ?? null, type: e.type })
      }
      for (const p of (prods.data ?? []) as Array<{ id: string; nom: string; commune: string | null; photos: string[] | null }>) {
        items.push({ kind: 'producteur', id: p.id, nom: p.nom, commune: p.commune, photo: p.photos?.[0] ?? null, type: null })
      }
      setResults(items)
      setSearching(false)
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, open])

  const handlePick = (item: ResultItem) => {
    onChange({ kind: item.kind, id: item.id })
    setOpen(false)
    setQuery('')
    setResults([])
  }

  return (
    <div>
      {/* Fiche courante ou bouton choisir */}
      {current ? (
        <div className="flex items-center gap-3 rounded-[10px] border border-bord bg-creme px-3 py-2">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-[8px] bg-bord/40">
            {current.photo && <img src={current.photo} alt="" className="h-full w-full object-cover" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[9px] font-extrabold tracking-[0.1em] uppercase text-primary">
              {current.kind === 'etablissement' ? (current.type ?? 'Établissement') : 'Producteur'}
            </div>
            <div className="truncate text-[13px] font-bold text-texte">{current.nom}</div>
            {current.commune && (
              <div className="truncate text-[10px] text-texte-doux">{current.commune}</div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg border border-bord bg-white px-2 py-1 text-[10px] font-bold text-texte"
          >
            Changer
          </button>
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Retirer"
            className="rounded-lg border border-accent bg-white px-2 py-1 text-[10px] font-bold text-accent"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full rounded-[10px] border border-dashed border-bord bg-creme py-2.5 text-[12px] font-bold text-primary"
        >
          + Choisir un établissement ou producteur
        </button>
      )}

      {/* Picker overlay */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9000,
            background: 'rgba(26,18,9,0.55)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 480, maxHeight: '80vh',
              background: '#FDFAF5', borderRadius: 16,
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 12px 36px rgba(26,18,9,0.35)',
            }}
          >
            <div className="flex items-center gap-2 border-b border-bord p-3">
              <input
                autoFocus
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Chercher un établissement ou producteur…"
                className="flex-1 rounded-[10px] border border-bord bg-white px-3 py-2 text-[14px] text-texte focus:outline-none focus:ring-2 focus:ring-primary/30"
                style={{ color: '#1A1209' }}
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-bord bg-white px-3 py-2 text-[12px] font-bold text-texte"
              >
                Fermer
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {query.trim().length < 2 && (
                <p className="p-4 text-center text-[12px] text-texte-tres-doux">
                  Tape au moins 2 caractères pour chercher.
                </p>
              )}
              {searching && (
                <p className="p-4 text-center text-[12px] text-texte-doux">Recherche…</p>
              )}
              {!searching && query.trim().length >= 2 && results.length === 0 && (
                <p className="p-4 text-center text-[12px] text-texte-tres-doux">Aucun résultat.</p>
              )}
              <ul className="space-y-1">
                {results.map(r => (
                  <li key={`${r.kind}-${r.id}`}>
                    <button
                      type="button"
                      onClick={() => handlePick(r)}
                      className="flex w-full items-center gap-3 rounded-[10px] border border-transparent px-3 py-2 text-left hover:bg-white"
                    >
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-[8px] bg-bord/40">
                        {r.photo && <img src={r.photo} alt="" className="h-full w-full object-cover" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[9px] font-extrabold tracking-[0.1em] uppercase text-primary">
                          {r.kind === 'etablissement' ? (r.type ?? 'Établissement') : 'Producteur'}
                        </div>
                        <div className="truncate text-[13px] font-bold text-texte">{r.nom}</div>
                        {r.commune && (
                          <div className="truncate text-[10px] text-texte-doux">{r.commune}</div>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
