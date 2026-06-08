'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import AnnonceForm from '@/components/AnnonceForm'
import { useSmartBack } from '@/hooks/useSmartBack'

export default function NouvelleAnnonceClient() {
  const router = useRouter()
  const goBack = useSmartBack('/annonces')
  const { user, loading } = useAuth()
  const { openAuthModal } = useAuthModal()

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
            Nouvelle annonce
          </div>
        </div>
        <button
          onClick={goBack}
          className="shrink-0 bg-transparent px-1 py-2 text-[12px] font-bold text-texte-doux"
        >
          Annuler
        </button>
      </div>

      <div className="px-4 pt-3">
        <AnnonceForm bottomOffset={64} onSuccess={id => router.push(`/annonces/${id}`)} />
      </div>
    </div>
  )
}
