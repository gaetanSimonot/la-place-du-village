'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import { supabase } from '@/lib/supabase'
import type { ArticleJournal } from '@/lib/articles'

const STATUT_LABELS: Record<ArticleJournal['statut'], { label: string; bg: string; color: string }> = {
  brouillon:  { label: 'Brouillon',        bg: '#F0EAE0', color: '#7A6A5A' },
  en_attente: { label: 'En modération',    bg: '#FFF0E5', color: '#C84B2F' },
  valide:     { label: 'Validé',           bg: '#E8F2EB', color: '#2D5A3D' },
  refuse:     { label: 'Refusé',           bg: '#FBE9E7', color: '#C0392B' },
  publie:     { label: 'Publié',           bg: '#2D5A3D', color: '#FDFAF5' },
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function MesArticlesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading } = useAuth()
  const { openAuthModal } = useAuthModal()
  const [articles, setArticles] = useState<ArticleJournal[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoadingList(true)
    const res = await fetch('/api/articles/mes-articles', { headers: await authHeaders() })
    if (res.ok) {
      const d = await res.json()
      setArticles((d.articles ?? []) as ArticleJournal[])
    }
    setLoadingList(false)
  }, [])

  useEffect(() => {
    if (loading) return
    if (!user) { openAuthModal('/journal/articles'); return }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading])

  useEffect(() => {
    if (searchParams.get('soumis') === '1') {
      setToast('✓ Article soumis pour modération')
      setTimeout(() => setToast(null), 3500)
    } else if (searchParams.get('brouillon') === '1') {
      setToast('✓ Brouillon sauvegardé')
      setTimeout(() => setToast(null), 2500)
    }
  }, [searchParams])

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cet article ?')) return
    const res = await fetch(`/api/articles/${id}`, { method: 'DELETE', headers: await authHeaders() })
    if (res.ok) load()
  }

  if (loading || !user) {
    return (
      <main className="min-h-[100dvh] bg-creme p-6 font-inter">
        <p className="text-texte-doux">Chargement…</p>
      </main>
    )
  }

  return (
    <main className="min-h-[100dvh] bg-creme pb-32 font-inter">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-2.5 px-4 pb-2 pt-3.5">
        <button
          onClick={() => router.back()}
          aria-label="Retour"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-bord bg-white text-texte shadow-[0_1px_2px_rgba(44,28,16,0.04)]"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="font-serif text-[17px] leading-none text-texte" style={{ letterSpacing: '-0.01em' }}>
            Mes articles
          </div>
        </div>
        <Link
          href="/journal/articles/nouveau"
          className="rounded-xl bg-primary px-3 py-2 text-[12px] font-bold text-white"
        >
          + Nouvel
        </Link>
      </div>

      {toast && (
        <div className="mx-4 mt-2 rounded-[12px] border border-primary bg-[#E8F2EB] px-4 py-2 text-[12px] font-bold text-primary">
          {toast}
        </div>
      )}

      <div className="px-4 pt-3">
        {loadingList && <p className="text-[13px] text-texte-doux">Chargement…</p>}
        {!loadingList && articles.length === 0 && (
          <div className="rounded-[14px] border border-bord bg-white p-6 text-center">
            <div className="font-serif text-[18px] text-texte" style={{ letterSpacing: '-0.01em' }}>
              Aucun article pour l&apos;instant
            </div>
            <p className="mt-2 text-[12px] text-texte-doux">
              Écris ta première contribution au Journal du Village.
            </p>
            <Link
              href="/journal/articles/nouveau"
              className="mt-4 inline-flex rounded-xl bg-primary px-4 py-2 text-[12px] font-bold text-white"
            >
              + Nouvel article
            </Link>
          </div>
        )}
        {!loadingList && articles.length > 0 && (
          <ul className="space-y-2">
            {articles.map(a => {
              const meta = STATUT_LABELS[a.statut]
              const canEdit = a.statut === 'brouillon' || a.statut === 'en_attente' || a.statut === 'refuse'
              const canDelete = a.statut !== 'publie'
              return (
                <li key={a.id} className="overflow-hidden rounded-[14px] border border-bord bg-white">
                  <div className="flex items-center gap-3 p-3">
                    {a.photo_url && (
                      <img src={a.photo_url} alt="" className="h-14 w-14 shrink-0 rounded-[10px] object-cover" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="rounded-full px-2 py-[2px] text-[9px] font-extrabold uppercase tracking-[0.06em]"
                          style={{ background: meta.bg, color: meta.color }}
                        >
                          {meta.label}
                        </span>
                      </div>
                      <div className="mt-1 truncate font-serif text-[15px] text-texte" style={{ letterSpacing: '-0.01em' }}>
                        {a.titre}
                      </div>
                      <div className="mt-0.5 truncate text-[10px] text-texte-doux">
                        {new Date(a.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                      {a.statut === 'refuse' && a.refus_motif && (
                        <div className="mt-1 text-[10px] text-accent">Motif : {a.refus_motif}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 border-t border-bordSoft bg-creme px-3 py-2">
                    {canEdit && (
                      <Link
                        href={`/journal/articles/${a.id}/edit`}
                        className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-white"
                      >
                        Éditer
                      </Link>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDelete(a.id)}
                        className="rounded-lg border border-accent bg-white px-3 py-1.5 text-[11px] font-bold text-accent"
                      >
                        Supprimer
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </main>
  )
}
