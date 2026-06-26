'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface JournalRow {
  id: string
  numero: number
  cover_titre: string
  statut: 'brouillon' | 'publie'
  selection_article_id: string | null
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

interface Props {
  articleId: string
  /** Si l'article est déjà attaché à un journal — affichage différent */
  currentJournalId?: string | null
  /** Callback appelé après attache réussie */
  onAttached?: (journalId: string, journalNumero: number) => void
  /** Callback appelé après détachement réussi */
  onDetached?: () => void
  onClose: () => void
}

export default function JournalAttachPicker({
  articleId, currentJournalId, onAttached, onDetached, onClose,
}: Props) {
  const [journals, setJournals] = useState<JournalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const res = await fetch('/api/admin/journal', { headers: await authHeaders() })
      const d = await res.json()
      if (cancelled) return
      setJournals((d.journaux ?? []) as JournalRow[])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const attach = async (journal: JournalRow) => {
    setBusy(journal.id); setError(null)
    try {
      // Un numéro peut contenir PLUSIEURS articles (relation articles_journal.journal_id).
      // On n'écrase donc plus l'article existant : on attache en plus.
      // selection_article_id reste juste la « une » → posée seulement si le
      // numéro n'en a pas encore.
      if (!journal.selection_article_id) {
        await fetch(`/api/admin/journal/${journal.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
          body: JSON.stringify({ selection_article_id: articleId }),
        })
      }
      // Update article : statut + journal_id (le rattache à CE numéro)
      const newStatut = journal.statut === 'publie' ? 'publie' : 'valide'
      await fetch(`/api/admin/articles/${articleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ statut: newStatut, journal_id: journal.id }),
      })
      onAttached?.(journal.id, journal.numero)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(null)
    }
  }

  const detach = async () => {
    if (!currentJournalId) return
    if (!confirm('Détacher l\'article du journal courant ?')) return
    setBusy(currentJournalId); setError(null)
    try {
      await fetch(`/api/admin/journal/${currentJournalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ selection_article_id: null }),
      })
      await fetch(`/api/admin/articles/${articleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ statut: 'valide', journal_id: null }),
      })
      onDetached?.()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
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
          <div className="font-serif text-[18px] text-texte" style={{ letterSpacing: '-0.01em' }}>
            Attacher à un numéro
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-bord bg-white px-3 py-1.5 text-[11px] font-bold text-texte"
          >
            Fermer
          </button>
        </div>

        {error && (
          <div className="mx-4 mt-3 rounded-[10px] border border-accent bg-[#FFF0E5] px-3 py-2 text-[12px] text-accent">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3">
          {currentJournalId && (
            <button
              type="button"
              onClick={detach}
              disabled={busy != null}
              className="mb-3 w-full rounded-[10px] border border-accent bg-white py-2.5 text-[12px] font-bold text-accent disabled:opacity-50"
            >
              ✕ Détacher du journal courant
            </button>
          )}
          {loading && <p className="text-center text-[12px] text-texte-doux">Chargement…</p>}
          {!loading && journals.length === 0 && (
            <p className="p-4 text-center text-[12px] text-texte-tres-doux">
              Aucun numéro. Crée un brouillon ou génère un journal.
            </p>
          )}
          <ul className="space-y-1.5">
            {journals.map(j => {
              const isCurrent = j.id === currentJournalId
              const hasOtherArticle = !!j.selection_article_id && j.selection_article_id !== articleId
              return (
                <li key={j.id}>
                  <button
                    type="button"
                    onClick={() => attach(j)}
                    disabled={isCurrent || busy != null}
                    className={`flex w-full items-center gap-3 rounded-[10px] border px-3 py-2 text-left disabled:opacity-50 ${
                      isCurrent ? 'border-primary bg-[#E8F2EB]' : 'border-bord bg-white hover:bg-creme'
                    }`}
                  >
                    <div className="font-serif text-[20px] text-primary leading-none">n°{j.numero}</div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-bold text-texte">{j.cover_titre}</div>
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className={j.statut === 'publie' ? 'font-bold text-primary' : 'font-bold text-texte-doux'}>
                          {j.statut === 'publie' ? '✓ PUBLIÉ' : 'BROUILLON'}
                        </span>
                        {hasOtherArticle && (
                          <span className="text-primary">+ s’ajoute aux articles du numéro</span>
                        )}
                      </div>
                    </div>
                    {isCurrent ? (
                      <span className="text-[11px] font-bold text-primary">attaché</span>
                    ) : (
                      <span className="text-[11px] font-bold text-primary">attacher →</span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}
