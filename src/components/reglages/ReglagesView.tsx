'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import LoginView from '@/components/LoginView'
import AdminAccess from '@/components/AdminAccess'
import MesAnnonces from '@/components/MesAnnonces'
import AbonnementsView from '@/components/AbonnementsView'
import MonEspaceProducteur from '@/components/MonEspaceProducteur'
import ReglagesGroups from './ReglagesGroups'
import SubViewWrap from './SubViewWrap'

type SubView = null | 'annonces' | 'events' | 'promos' | 'producteur'

const IcBack = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
)

export default function ReglagesView() {
  const { user, profile, loading, signOut } = useAuth()
  const [subView, setSubView] = useState<SubView>(null)

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-creme">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-bord border-t-primary" />
      </div>
    )
  }

  if (!user || !profile) {
    return (
      <div className="min-h-[100dvh] bg-creme font-inter">
        <div className="px-5 pb-6 pt-10 text-center">
          <h1
            className="m-0 mb-2 font-serif text-[26px] font-normal text-texte"
            style={{ letterSpacing: '-0.02em' }}
          >
            Connecte-toi
          </h1>
          <p className="m-0 text-[14px] leading-[1.5] text-texte-doux">
            Connecte-toi pour accéder à tes réglages.
          </p>
        </div>
        <LoginView />
      </div>
    )
  }

  // Sous-vues plein écran — pluggage des composants existants
  if (subView === 'annonces')   return <SubViewWrap title="Mes annonces"     onBack={() => setSubView(null)}><MesAnnonces /></SubViewWrap>
  if (subView === 'events')     return <SubViewWrap title="Mes événements"   onBack={() => setSubView(null)}><AbonnementsView mode="mine" /></SubViewWrap>
  if (subView === 'producteur') return <SubViewWrap title="Ma fiche producteur" onBack={() => setSubView(null)}><MonEspaceProducteur /></SubViewWrap>
  if (subView === 'promos')     {
    // /promotions est une route complète avec sa propre nav — on y route plutôt que inliner.
    if (typeof window !== 'undefined') window.location.href = '/promotions'
    return null
  }

  return (
    <main className="min-h-[100dvh] bg-creme pb-10 font-inter text-texte">
      {/* Top bar */}
      <div
        className="flex items-center gap-2.5 px-4 pt-3.5"
        style={{ paddingTop: 'max(14px, env(safe-area-inset-top, 14px))' }}
      >
        <Link
          href="/profil"
          aria-label="Retour"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border bg-white text-texte"
          style={{ borderColor: '#E8E0D4', boxShadow: '0 1px 2px rgba(44,28,16,0.04)' }}
        >
          <IcBack />
        </Link>
        <h1
          className="m-0 flex-1 truncate font-serif text-[18px] leading-none text-texte"
          style={{ letterSpacing: '-0.005em' }}
        >
          Réglages
        </h1>
        <div className="h-10 w-10 shrink-0" aria-hidden />
      </div>

      <ReglagesGroups
        profile={profile}
        email={user.email ?? ''}
        onOpenSub={setSubView}
        signOut={signOut}
      />

      {/* Footer + AdminAccess discret */}
      <div className="mt-3 flex flex-col items-center gap-2 px-4 pt-3 text-[10.5px] leading-[1.5] text-texte-tres-doux">
        <div className="text-center">
          La Place du Village · version 0.1.0
        </div>
        <AdminAccess />
      </div>
    </main>
  )
}
