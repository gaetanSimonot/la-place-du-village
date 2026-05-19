'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { ArticleJournal } from '@/lib/articles'

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

interface Props {
  /** Id de l'article courant attaché au numéro (peut être null) */
  value: string | null
  /** Id du journal édité — pour exclure l'article courant des candidats si besoin */
  journalId?: string
  /** Callback sur changement (null = retirer) */
  onChange: (id: string | null) => void
}

export default function ArticlePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState<ArticleJournal | null>(null)
  const [candidates, setCandidates] = useState<ArticleJournal[]>([])
  const [loading, setLoading] = useState(false)

  // Charge l'article courant
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!value) { setCurrent(null); return }
      const res = await fetch(`/api/admin/articles?statut=publie`, { headers: await authHeaders() })
      const d = await res.json()
      const found = ((d.articles ?? []) as ArticleJournal[]).find(a => a.id === value)
      if (cancelled) return
      if (found) { setCurrent(found); return }
      // Fallback : article peut-être en valide ou en_attente
      const res2 = await fetch(`/api/admin/articles`, { headers: await authHeaders() })
      const d2 = await res2.json()
      const found2 = ((d2.articles ?? []) as ArticleJournal[]).find(a => a.id === value)
      if (cancelled) return
      setCurrent(found2 ?? null)
    })()
    return () => { cancelled = true }
  }, [value])

  // Charge les candidats (statut=valide) au moment de l'ouverture du picker
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const res = await fetch(`/api/admin/articles?statut=valide`, { headers: await authHeaders() })
      const d = await res.json()
      if (!cancelled) {
        setCandidates((d.articles ?? []) as ArticleJournal[])
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [open])

  const pick = (id: string) => {
    onChange(id)
    setOpen(false)
  }

  return (
    <div>
      {current ? (
        <div className="flex items-center gap-3 rounded-[10px] border border-bord bg-creme px-3 py-2">
          {current.photo_url && (
            <img src={current.photo_url} alt="" className="h-10 w-10 shrink-0 rounded-[8px] object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[9px] font-extrabold tracking-[0.1em] uppercase text-primary">
              Article — {current.statut}
            </div>
            <div className="truncate text-[13px] font-bold text-texte">{current.titre}</div>
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
          + Choisir un article validé
        </button>
      )}

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
            <div className="flex items-center justify-between border-b border-bord px-4 py-3">
              <div className="font-serif text-[16px] text-texte" style={{ letterSpacing: '-0.01em' }}>
                Articles validés
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-bord bg-white px-3 py-1.5 text-[11px] font-bold text-texte"
              >
                Fermer
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {loading && <p className="p-4 text-center text-[12px] text-texte-doux">Chargement…</p>}
              {!loading && candidates.length === 0 && (
                <p className="p-4 text-center text-[12px] text-texte-tres-doux">
                  Aucun article validé en attente. Valide un article depuis la liste de modération.
                </p>
              )}
              <ul className="space-y-1">
                {candidates.map(a => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => pick(a.id)}
                      className="flex w-full items-center gap-3 rounded-[10px] border border-transparent px-3 py-2 text-left hover:bg-white"
                    >
                      {a.photo_url && (
                        <img src={a.photo_url} alt="" className="h-10 w-10 shrink-0 rounded-[8px] object-cover" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-bold text-texte">{a.titre}</div>
                        <div className="line-clamp-2 text-[10px] text-texte-doux">{a.corps.slice(0, 120)}…</div>
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
