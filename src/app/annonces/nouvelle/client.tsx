'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import AnnonceForm from '@/components/AnnonceForm'
import ArticleJournalForm from '@/components/ArticleJournalForm'
import BottomNavBar from '@/components/BottomNavBar'
import { canSubmitArticleJournal } from '@/lib/articles'

type Tab = 'annonce' | 'article'

export default function NouvelleAnnonceClient() {
  const router = useRouter()
  const { user, profile, loading } = useAuth()
  const { openAuthModal } = useAuthModal()
  const [tab, setTab] = useState<Tab>('annonce')

  const plan = (profile?.plan ?? 'basic') as 'basic' | 'habitants' | 'pro'
  const canArticle = canSubmitArticleJournal(plan)

  useEffect(() => {
    if (!loading && !user) openAuthModal('/annonces/nouvelle')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user])

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2EBE0' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '4px solid #E0D8CE', borderTopColor: '#2D5A3D', animation: 'spin 0.7s linear infinite' }} />
      </div>
    )
  }
  if (!user) {
    return (
      <div style={{ minHeight: '100dvh', backgroundColor: '#F2EBE0', padding: 40, textAlign: 'center', fontFamily: 'Inter, sans-serif' }}>
        <p style={{ color: '#8A7A6A' }}>Connectez-vous pour publier une annonce.</p>
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] pb-32 font-inter text-texte" style={{ background: '#FDFAF5' }}>
      {/* Top bar V3 */}
      <div className="flex items-center justify-between gap-2.5 px-4 pt-3.5 pb-2">
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
            {tab === 'article' ? 'Nouvel article' : 'Nouvelle annonce'}
          </div>
        </div>
        <button
          onClick={() => router.back()}
          className="shrink-0 bg-transparent px-1 py-2 text-[12px] font-bold text-texte-doux"
        >
          Annuler
        </button>
      </div>

      {/* Toggle Annonce / Article — visible si plan habitants/pro */}
      {canArticle && (
        <div className="px-4 pt-2">
          <div className="flex rounded-full bg-[#E8F2EB] p-1">
            <button
              type="button"
              onClick={() => setTab('annonce')}
              className="flex-1 rounded-full py-2 text-[12px] font-bold transition-colors"
              style={{
                background: tab === 'annonce' ? '#2D5A3D' : 'transparent',
                color: tab === 'annonce' ? '#fff' : '#2D5A3D',
              }}
            >
              Annonce
            </button>
            <button
              type="button"
              onClick={() => setTab('article')}
              className="flex-1 rounded-full py-2 text-[12px] font-bold transition-colors"
              style={{
                background: tab === 'article' ? '#2D5A3D' : 'transparent',
                color: tab === 'article' ? '#fff' : '#2D5A3D',
              }}
            >
              Article journal
            </button>
          </div>
        </div>
      )}

      {/* Form — annonce ou article selon l'onglet */}
      <div className="px-4 pt-3">
        {tab === 'article'
          ? <ArticleJournalForm onSuccess={() => router.push('/profil')} />
          : <AnnonceForm onSuccess={id => router.push(`/annonces/${id}`)} canFlagJournal={canArticle} />
        }
      </div>

      <BottomNavBar />
    </div>
  )
}
