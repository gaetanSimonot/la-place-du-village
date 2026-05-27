'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PLANS_INFO, type Plan } from '@/lib/capabilities'
import LoginView from '@/components/LoginView'
// AdminAccess retiré le 2026-05-28 : bouton visible aux non-admins qui
// router.push('/admin') sur N'IMPORTE QUEL code à 4 chiffres tapé.
// /admin lui-même est protégé côté DB (admin_emails) donc pas d'élévation
// réelle de privilège, mais surface d'attaque inutile + UX trompeuse.
// L'accès admin se fait désormais uniquement par URL directe /admin
// pour les comptes présents dans la table admin_emails.
import BottomNavBar from '@/components/BottomNavBar'
import MesAnnonces from '@/components/MesAnnonces'
import AbonnementsView from '@/components/AbonnementsView'
import MonEspaceProducteur from '@/components/MonEspaceProducteur'
import SubViewWrap from './SubViewWrap'
import DeleteAccountModal from './DeleteAccountModal'
import MembresBloquesList from './MembresBloquesList'
import ProfilTab from './tabs/ProfilTab'
import MonEspaceTab from './tabs/MonEspaceTab'
import MonPlanTab from './tabs/MonPlanTab'
import { I } from './shared'

export type ReglagesSubView =
  | null
  | 'annonces'
  | 'events'
  | 'producteur'
  | 'abonnements'
  | 'bloques'

type Tab = 'profil' | 'espace' | 'plan'

const IcBack = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
)

function isTab(v: string | null): v is Tab {
  return v === 'profil' || v === 'espace' || v === 'plan'
}

export default function ReglagesView() {
  const { user, profile, loading, isAdmin, signOut } = useAuth()
  const [subView, setSubView]   = useState<ReglagesSubView>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [activeTab, setActiveTab]   = useState<Tab>('profil')
  const [signingOut, setSigningOut] = useState(false)
  const [plan, setPlan] = useState<Plan>((profile?.plan as Plan) ?? 'basic')

  // Initialise tab depuis ?tab= (window.location pour éviter useSearchParams CSR bailout)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const t = new URLSearchParams(window.location.search).get('tab')
    if (isTab(t)) setActiveTab(t)
  }, [])

  function changeTab(next: Tab) {
    setActiveTab(next)
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    url.searchParams.set('tab', next)
    window.history.replaceState({}, '', url)
  }

  // Refresh du plan en arrière-plan (webhook Stripe)
  useEffect(() => {
    if (!profile?.id) return
    let cancelled = false
    supabase
      .from('profiles')
      .select('plan')
      .eq('user_id', profile.id)
      .single()
      .then(({ data }) => {
        if (!cancelled && data?.plan) setPlan(data.plan as Plan)
      })
    return () => { cancelled = true }
  }, [profile?.id])

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
          <h1 className="m-0 mb-2 font-serif text-[26px] font-normal text-texte" style={{ letterSpacing: '-0.02em' }}>
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

  // Sous-vues plein écran — réutilisent les composants existants tels quels
  if (subView === 'annonces')     return <SubViewWrap title="Mes annonces"        onBack={() => setSubView(null)}><MesAnnonces /></SubViewWrap>
  if (subView === 'events')       return <SubViewWrap title="Mes événements"      onBack={() => setSubView(null)}><AbonnementsView mode="mine" /></SubViewWrap>
  if (subView === 'producteur')   return <SubViewWrap title="Ma fiche producteur" onBack={() => setSubView(null)}><MonEspaceProducteur /></SubViewWrap>
  if (subView === 'abonnements')  return <SubViewWrap title="Mes abonnements"     onBack={() => setSubView(null)}><AbonnementsView mode="feed" /></SubViewWrap>
  if (subView === 'bloques')      return <SubViewWrap title="Membres bloqués"     onBack={() => setSubView(null)}><MembresBloquesList /></SubViewWrap>

  const initial = (profile.display_name ?? user.email ?? '·').trim().charAt(0).toUpperCase() || '·'
  const planInfo = PLANS_INFO[plan]

  async function handleSignOut() {
    if (signingOut) return
    setSigningOut(true)
    await signOut()
    setSigningOut(false)
  }

  return (
    <main className="min-h-[100dvh] bg-creme pb-28 font-inter text-texte">
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
        <h1 className="m-0 flex-1 truncate font-serif text-[18px] leading-none text-texte" style={{ letterSpacing: '-0.005em' }}>
          Réglages
        </h1>
        <div className="h-10 w-10 shrink-0" aria-hidden />
      </div>

      {/* Card compte top avec bouton déconnexion */}
      <div className="px-4 pt-3.5">
        <div
          className="flex items-center gap-3.5 rounded-[16px] border bg-white p-3.5"
          style={{ borderColor: '#F0EAE0', boxShadow: '0 1px 4px rgba(44,28,16,0.04)' }}
        >
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary font-serif text-[20px] text-white">
              {initial}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-extrabold text-texte" style={{ letterSpacing: '-0.005em' }}>
              {profile.display_name ?? 'Sans nom'}
            </div>
            <div className="mt-[1px] truncate text-[11px] text-texte-doux">{user.email}</div>
            <span
              className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-[9.5px] font-extrabold uppercase"
              style={{ background: planInfo.bgColor, color: planInfo.color, letterSpacing: '0.08em' }}
            >
              {planInfo.label}
            </span>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            aria-label="Se déconnecter"
            title="Se déconnecter"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] disabled:opacity-60"
            style={{ background: '#FBE9E5', color: '#B53A22' }}
          >
            {I.power(18)}
          </button>
        </div>
      </div>

      {/* Tab switcher — capsule comme la page profil */}
      <div className="px-4 pt-4">
        <div
          className="grid grid-cols-3 gap-0 rounded-[14px] p-1"
          style={{ background: '#F7F1E6' }}
        >
          {(['profil', 'espace', 'plan'] as Tab[]).map(t => {
            const active = activeTab === t
            return (
              <button
                key={t}
                type="button"
                onClick={() => changeTab(t)}
                aria-pressed={active}
                className="rounded-[11px] py-2.5 text-[13px]"
                style={{
                  background: active ? '#FFFFFF' : 'transparent',
                  boxShadow: active ? '0 1px 3px rgba(44,28,16,0.10)' : 'none',
                  color: active ? '#1A1209' : '#7A6A5A',
                  fontWeight: active ? 800 : 700,
                  letterSpacing: '-0.005em',
                }}
              >
                {t === 'profil' ? 'Profil' : t === 'espace' ? 'Mon espace' : 'Mon plan'}
              </button>
            )
          })}
        </div>
      </div>

      {/* Contenu du tab actif */}
      <div className="px-4 pt-4">
        {activeTab === 'profil' && <ProfilTab profile={profile} />}
        {activeTab === 'espace' && <MonEspaceTab profile={profile} onOpenSub={setSubView} />}
        {activeTab === 'plan'   && (
          <MonPlanTab
            plan={plan}
            isAdmin={isAdmin}
            onOpenSub={setSubView}
            onDeleteAccount={() => setDeleteOpen(true)}
          />
        )}
      </div>

      {/* Footer simple (AdminAccess retiré pour sécurité — cf. commit notes) */}
      <div className="mt-4 flex flex-col items-center gap-2 px-4 pt-2 text-[10.5px] leading-[1.5] text-texte-tres-doux">
        <div className="text-center">La Place du Village · version 0.1.0</div>
      </div>

      {deleteOpen && (
        <DeleteAccountModal
          email={user.email ?? ''}
          signOut={signOut}
          onClose={() => setDeleteOpen(false)}
        />
      )}

      <BottomNavBar />
    </main>
  )
}
