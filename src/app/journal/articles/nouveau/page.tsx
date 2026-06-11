'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import { canSubmitArticleJournal } from '@/lib/articles'
import ArticleJournalForm from '@/components/ArticleJournalForm'
import BottomNavBar from '@/components/BottomNavBar'
import SubscriptionModal from '@/components/SubscriptionModal'
import { useSmartBack } from '@/hooks/useSmartBack'

export default function NouvelArticleJournalPage() {
  const router = useRouter()
  const goBack = useSmartBack('/journal/articles')
  const { user, profile, loading } = useAuth()
  const { openAuthModal } = useAuthModal()
  const [showSub, setShowSub] = useState(false)

  useEffect(() => {
    if (!loading && !user) openAuthModal('/journal/articles/nouveau')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user])

  if (loading) {
    return (
      <main className="min-h-[100dvh] bg-creme p-6 font-inter">
        <p className="text-texte-doux">Chargement…</p>
      </main>
    )
  }
  if (!user) return null

  const plan = (profile?.plan ?? 'basic') as 'basic' | 'habitants' | 'pro'
  const allowed = canSubmitArticleJournal(plan)

  return (
    <main className="min-h-[100dvh] bg-creme pb-32 font-inter">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-2.5 px-4 pb-2 pt-3.5">
        <button
          onClick={goBack}
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
            Écrire un article
          </div>
        </div>
        <div className="w-10" />
      </div>

      <div className="px-4 pt-2">
        {allowed ? (
          <ArticleJournalForm
            onSaved={(_, action) => {
              if (action === 'soumis') router.push('/journal/articles?soumis=1')
              else router.push('/journal/articles?brouillon=1')
            }}
          />
        ) : (
          <div className="rounded-[14px] border border-accent bg-[#FFF0E5] p-5 text-[13px] leading-[1.5] text-accent">
            <div className="font-bold">Réservé aux abonnés Habitants &amp; Pro</div>
            <p className="mt-1 text-[13px] text-texte">
              Les articles du Journal du Village sont disponibles dès le premier abonnement.
              Passe Habitant ou Partenaire Local pour participer.
            </p>
            <button
              onClick={() => setShowSub(true)}
              className="mt-3 w-full rounded-xl border-none bg-accent py-2.5 text-[13px] font-bold text-white"
            >
              Voir les abonnements
            </button>
          </div>
        )}
      </div>
      <BottomNavBar />

      {showSub && (
        <SubscriptionModal
          context={{ kind: 'feature', featureLabel: 'Écrire dans le Journal du Village', minPlan: 'habitants' }}
          currentPlan={plan}
          onClose={() => setShowSub(false)}
        />
      )}
    </main>
  )
}
