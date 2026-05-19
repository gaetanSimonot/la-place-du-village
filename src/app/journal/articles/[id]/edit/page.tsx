'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import { supabase } from '@/lib/supabase'
import ArticleJournalForm from '@/components/ArticleJournalForm'
import BottomNavBar from '@/components/BottomNavBar'
import type { ArticleJournal } from '@/lib/articles'

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function EditArticlePage() {
  const params = useParams<{ id: string }>()
  const id = params?.id ?? ''
  const router = useRouter()
  const { user, loading } = useAuth()
  const { openAuthModal } = useAuthModal()
  const [article, setArticle] = useState<ArticleJournal | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (loading) return
    if (!user) { openAuthModal(`/journal/articles/${id}/edit`); return }
    ;(async () => {
      const res = await fetch(`/api/articles/${id}`, { headers: await authHeaders() })
      const d = await res.json()
      if (res.ok) setArticle(d.article as ArticleJournal)
      else setError(d.error || 'Erreur chargement')
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, id])

  if (loading || !user) {
    return (
      <main className="min-h-[100dvh] bg-creme p-6 font-inter">
        <p className="text-texte-doux">Chargement…</p>
      </main>
    )
  }
  if (error) {
    return (
      <main className="min-h-[100dvh] bg-creme p-6 font-inter">
        <div className="rounded-[12px] border border-accent bg-[#FFF0E5] p-4 text-[13px] text-accent">
          {error}
        </div>
      </main>
    )
  }
  if (!article) {
    return (
      <main className="min-h-[100dvh] bg-creme p-6 font-inter">
        <p className="text-texte-doux">Chargement…</p>
      </main>
    )
  }

  return (
    <main className="min-h-[100dvh] bg-creme pb-32 font-inter">
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
            Éditer mon article
          </div>
        </div>
        <div className="w-10" />
      </div>

      <div className="px-4 pt-2">
        <ArticleJournalForm
          initial={article}
          onSaved={(_, action) => {
            if (action === 'soumis') router.push('/journal/articles?soumis=1')
            else router.push('/journal/articles?brouillon=1')
          }}
        />
      </div>
      <BottomNavBar />
    </main>
  )
}
