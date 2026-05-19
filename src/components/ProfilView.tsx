'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAdminSession } from '@/hooks/useAdminSession'
import { useTheme } from '@/components/ThemeProvider'
import { COLOR_THEMES, MAP_STYLES, SHEET_BG_OPTIONS } from '@/lib/themes'
import { PLANS_INFO, type Plan } from '@/lib/capabilities'
import LoginView from '@/components/LoginView'
import SubscriptionModal from '@/components/SubscriptionModal'
import MesAnnonces from '@/components/MesAnnonces'
import AbonnementsView from '@/components/AbonnementsView'
import MonEspaceProducteur from '@/components/MonEspaceProducteur'
import EditProfileModal from '@/components/EditProfileModal'

type Tab = 'profil' | 'reglages'
type SubView = null | 'annonces' | 'abonnements' | 'mes_events' | 'producteur'

interface Etab { id: string; nom: string; plan: string; photos: string[] | null }
interface MyProducer { id: string; nom: string; photos: string[] | null; commune: string | null }
interface AbandonedDraft {
  id: string
  etablissement: { id: string; nom: string; commune: string | null; photos: string[] | null }
  updated_at: string
}

/* ─── Icons SVG inline (taille variable) ──────────────────────────────── */

type IconRenderer = (size?: number) => React.ReactNode

function makeIcon(path: React.ReactNode): IconRenderer {
  return function IconRender(size = 18) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{path}</svg>
    )
  }
}

const ICONS = {
  back:     makeIcon(<><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>),
  settings: makeIcon(<><circle cx="12" cy="12" r="3"/><path d="M12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></>),
  edit:     makeIcon(<><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></>),
  eye:      makeIcon(<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>),
  cc:       makeIcon(<><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></>),
  store:    makeIcon(<><path d="M3 9l1-5h16l1 5"/><path d="M4 9v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/><path d="M9 21V12h6v9"/></>),
  megaphone:makeIcon(<><polygon points="3 11 22 2 22 22 3 13"/><line x1="3" y1="11" x2="3" y2="13"/></>),
  cal:      makeIcon(<><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>),
  leaf:     makeIcon(<><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19.2 2.96c1.4 9.3-3.6 15.8-8.2 17.04z"/><path d="M2 21c0-3 1.85-5.36 5.08-6"/></>),
  life:     makeIcon(<><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="4.93" y1="4.93" x2="9.17" y2="9.17"/><line x1="14.83" y1="14.83" x2="19.07" y2="19.07"/><line x1="14.83" y1="9.17" x2="19.07" y2="4.93"/><line x1="4.93" y1="19.07" x2="9.17" y2="14.83"/></>),
  group:    makeIcon(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>),
  rocket:   makeIcon(<><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></>),
  shield:   makeIcon(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>),
  star:     makeIcon(<polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9"/>),
  journal:  makeIcon(<><rect x="2" y="4" width="20" height="16" rx="2" ry="2"/><line x1="6" y1="8" x2="18" y2="8"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="6" y1="16" x2="14" y2="16"/></>),
  chat:     makeIcon(<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>),
  logout:   makeIcon(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>),
  chev:     makeIcon(<polyline points="9 6 15 12 9 18"/>),
  draft:    makeIcon(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>),
  palette:  makeIcon(<><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-5.52-4.48-10-10-10z"/></>),
}

export default function ProfilView() {
  const { user, profile, loading: authLoading, signOut, updateDisplayName } = useAuth()
  const isAdmin = useAdminSession()
  const theme = useTheme()

  const [tab, setTab] = useState<Tab>('profil')
  const [subView, setSubView] = useState<SubView>(null)

  const [plan, setPlan] = useState<string | null>(null)
  const [myEtabs, setMyEtabs] = useState<Etab[]>([])
  const [myProducers, setMyProducers] = useState<MyProducer[]>([])
  const [interestCount, setInterestCount] = useState<number | null>(null)
  const [activeAnnonceCount, setActiveAnnonceCount] = useState<number | null>(null)
  const [followingCount, setFollowingCount] = useState<number | null>(null)
  const [abandonedDrafts, setAbandonedDrafts] = useState<AbandonedDraft[]>([])

  const [editOpen, setEditOpen] = useState(false)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [supportUnread, setSupportUnread] = useState(0)
  const [openingPortal, setOpeningPortal] = useState(false)

  async function openStripePortal() {
    if (openingPortal) return
    setOpeningPortal(true)
    const t = await getToken()
    if (!t) { setOpeningPortal(false); return }
    const r = await fetch('/api/stripe/manage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}` },
    })
    if (r.ok) {
      const d = await r.json()
      if (d.url) { window.location.href = d.url; return }
    } else {
      const d = await r.json().catch(() => ({}))
      alert(d.error ?? 'Erreur ouverture du portail')
    }
    setOpeningPortal(false)
  }

  // Compteur unread pour les tickets support (admin only)
  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    ;(async () => {
      const { count } = await supabase
        .from('support_messages')
        .select('id', { count: 'exact', head: true })
        .eq('sender_is_admin', false)
        .is('lu_at', null)
      if (!cancelled && typeof count === 'number') setSupportUnread(count)
    })()
    return () => { cancelled = true }
  }, [isAdmin])

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  // ── Chargement des données ─────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false

    supabase.from('profiles').select('plan').eq('user_id', user.id).single()
      .then(({ data }) => { if (!cancelled && data) setPlan(data.plan ?? null) })

    supabase.from('etablissements').select('id, nom, plan, photos').eq('user_id', user.id)
      .then(({ data }) => { if (!cancelled && data) setMyEtabs(data) })

    supabase.from('producers').select('id, nom, photos, commune').eq('user_id', user.id)
      .then(({ data }) => { if (!cancelled && data) setMyProducers(data) })

    supabase.from('interests').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
      .then(({ count }) => { if (!cancelled) setInterestCount(count ?? 0) })

    supabase.from('annonces').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('statut', 'active')
      .then(({ count }) => { if (!cancelled) setActiveAnnonceCount(count ?? 0) })

    supabase.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', user.id)
      .then(({ count }) => { if (!cancelled) setFollowingCount(count ?? 0) })

    ;(async () => {
      const t = await getToken()
      if (!t) return
      const r = await fetch('/api/profile/drafts', { headers: { Authorization: `Bearer ${t}` } })
      if (!r.ok) return
      const d = await r.json()
      const abandoned = (d.drafts ?? []).filter((x: { managed: boolean }) => !x.managed)
      if (!cancelled) setAbandonedDrafts(abandoned)
    })()

    return () => { cancelled = true }
  }, [user?.id])

  // ── Loading / non connecté ─────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex min-h-full items-center justify-center bg-creme">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-bord border-t-primary" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-full bg-creme font-inter">
        <div className="px-5 pb-6 pt-10 text-center">
          <h1 className="m-0 mb-2 font-serif text-[26px] font-normal text-texte" style={{ letterSpacing: '-0.02em' }}>
            Bienvenue
          </h1>
          <p className="m-0 text-[14px] leading-[1.5] text-texte-doux">
            Connecte-toi pour accéder à ton espace, profiter des bons plans et participer à la vie du village.
          </p>
        </div>
        <LoginView />
      </div>
    )
  }

  // ── Sous-vues plein écran ──────────────────────────────────────────────
  if (subView === 'annonces') {
    return <SubViewWrap title="Mes annonces" onBack={() => setSubView(null)}><MesAnnonces /></SubViewWrap>
  }
  if (subView === 'abonnements') {
    return <SubViewWrap title="Mes abonnements" onBack={() => setSubView(null)}><AbonnementsView mode="feed" /></SubViewWrap>
  }
  if (subView === 'mes_events') {
    return <SubViewWrap title="Événements suivis" onBack={() => setSubView(null)}><AbonnementsView mode="mine" /></SubViewWrap>
  }
  if (subView === 'producteur') {
    return <SubViewWrap title="Ma fiche producteur" onBack={() => setSubView(null)}><MonEspaceProducteur /></SubViewWrap>
  }

  const currentPlan = (plan ?? 'basic') as Plan
  const planInfo = PLANS_INFO[currentPlan]
  const displayName = profile?.display_name ?? user.email?.split('@')[0] ?? 'Mon profil'

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
    setSigningOut(false)
  }

  return (
    <div className="min-h-full bg-creme pb-10 font-inter text-texte">
      <style>{`.pdv-hscroll { scrollbar-width: none } .pdv-hscroll::-webkit-scrollbar { display: none } @keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* Top bar V3 */}
      <div className="flex items-center justify-between gap-2.5 px-4 pt-3.5">
        <div className="h-10 w-10 shrink-0" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col items-center">
          <div className="font-serif text-[18px] leading-none text-texte" style={{ letterSpacing: '-0.01em' }}>
            Mon espace
          </div>
        </div>
        <button
          onClick={() => setTab('reglages')}
          aria-label="Réglages"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-bord bg-white text-texte shadow-[0_1px_2px_rgba(44,28,16,0.04)]"
        >
          {ICONS.settings(18)}
        </button>
      </div>

      {/* User card V3 */}
      <div className="px-4 pt-[18px]">
        <div
          className="flex items-center gap-3.5 rounded-2xl border bg-white p-4 shadow-[0_1px_6px_rgba(44,28,16,0.04)]"
          style={{ borderColor: '#F0EAE0' }}
        >
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt=""
              className="h-16 w-16 shrink-0 rounded-full object-cover"
              style={{ border: '3px solid #E8F2EB' }}
            />
          ) : (
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary text-[24px] font-extrabold text-white"
              style={{ border: '3px solid #E8F2EB' }}
            >
              {displayName[0].toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <button
              onClick={() => setEditOpen(true)}
              className="flex items-center gap-2 bg-transparent p-0 text-left"
            >
              <span
                className="truncate text-[17px] font-extrabold text-texte"
                style={{ letterSpacing: '-0.01em' }}
              >
                {displayName}
              </span>
              <span className="shrink-0 rounded-full bg-cremeDeep px-[7px] py-0.5 text-[9px] font-extrabold uppercase tracking-[0.08em] text-texte-doux">
                {planInfo.label}
              </span>
              <span className="shrink-0 text-texte-tres-doux">{ICONS.edit(13)}</span>
            </button>
            <p className="mt-1 truncate text-[12px] text-texte-doux">{user.email}</p>
            <Link
              href={`/profil/${user.id}`}
              className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary-light px-2.5 py-1 text-[11px] font-bold text-primary no-underline"
            >
              {ICONS.eye(12)} Voir mon profil public
            </Link>
          </div>
        </div>
      </div>

      {/* Tabs V3 */}
      <div className="flex gap-1.5 px-4 pt-[18px]">
        {(['profil', 'reglages'] as Tab[]).map(t => {
          const active = tab === t
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 bg-transparent py-2.5 text-[13px] font-extrabold uppercase tracking-[0.04em] ${
                active ? 'text-primary' : 'text-texte-doux'
              }`}
              style={{
                borderBottom: active ? '2.5px solid #2D5A3D' : '2.5px solid transparent',
              }}
            >
              {t === 'profil' ? 'Profil' : 'Réglages'}
            </button>
          )
        })}
      </div>

      {/* Contenu */}
      {tab === 'profil' && (
        <div className="flex flex-col gap-3 pt-2">

          {/* Abonnement card V3 */}
          <div className="px-4">
            <div
              className="rounded-2xl border bg-white p-4 shadow-[0_1px_4px_rgba(44,28,16,0.04)]"
              style={{ borderColor: '#F0EAE0' }}
            >
              <div className="mb-2.5 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.1em] text-texte-doux">
                {ICONS.cc(14)} Mon abonnement
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div
                    className="font-serif text-[22px] leading-none text-texte"
                    style={{ letterSpacing: '-0.01em' }}
                  >
                    Plan {planInfo.label}
                  </div>
                  <p className="m-0 mt-1 text-[12px] text-texte-doux">{planInfo.priceLabel}</p>
                </div>
                <button
                  onClick={() => setShowUpgrade(true)}
                  className="shrink-0 whitespace-nowrap rounded-full bg-primary px-3.5 py-2 text-[12px] font-bold text-white"
                >
                  {currentPlan === 'basic' ? 'Upgrade' : 'Voir offres'}
                </button>
              </div>
              {currentPlan !== 'basic' && (
                <button
                  onClick={openStripePortal}
                  disabled={openingPortal}
                  className="mt-2.5 w-full rounded-xl border bg-cremeDeep py-2 text-[12px] font-bold text-texte-doux disabled:opacity-60"
                  style={{ borderColor: '#F0EAE0' }}
                >
                  {openingPortal ? 'Ouverture…' : 'Gérer mon abonnement'}
                </button>
              )}
            </div>
          </div>

          {/* Mes établissements */}
          {myEtabs.length > 0 && (
            <div className="px-4">
              <div
                className="overflow-hidden rounded-2xl border bg-white shadow-[0_1px_4px_rgba(44,28,16,0.04)]"
                style={{ borderColor: '#F0EAE0' }}
              >
                <div className="border-b px-4 pb-1.5 pt-3.5 text-[11px] font-extrabold uppercase tracking-[0.1em] text-texte-doux" style={{ borderColor: '#F0EAE0' }}>
                  Mes établissements ({myEtabs.length})
                </div>
                {myEtabs.map((e, i) => (
                  <Link
                    key={e.id}
                    href={`/etablissement/${e.id}`}
                    className="flex items-center gap-3 px-4 py-3 text-inherit no-underline"
                    style={{ borderTop: i > 0 ? '1px solid #F0EAE0' : undefined }}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary-light text-primary">
                      {e.photos?.[0]
                        ? <img src={e.photos[0]} alt="" className="h-full w-full object-cover" />
                        : ICONS.store(18)}
                    </div>
                    <span className="flex-1 truncate text-[13px] font-bold text-texte">{e.nom}</span>
                    <span className="text-texte-tres-doux">{ICONS.chev(14)}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Mes producteurs */}
          {myProducers.length > 0 && (
            <div className="px-4">
              <div
                className="overflow-hidden rounded-2xl border bg-white shadow-[0_1px_4px_rgba(44,28,16,0.04)]"
                style={{ borderColor: '#F0EAE0' }}
              >
                <div className="border-b px-4 pb-1.5 pt-3.5 text-[11px] font-extrabold uppercase tracking-[0.1em] text-texte-doux" style={{ borderColor: '#F0EAE0' }}>
                  Mes producteurs ({myProducers.length})
                </div>
                {myProducers.map((p, i) => (
                  <Link
                    key={p.id}
                    href={`/producteur/${p.id}`}
                    className="flex items-center gap-3 px-4 py-3 text-inherit no-underline"
                    style={{ borderTop: i > 0 ? '1px solid #F0EAE0' : undefined }}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary-light text-primary">
                      {p.photos?.[0]
                        ? <img src={p.photos[0]} alt="" className="h-full w-full object-cover" />
                        : <span className="text-lg">🌿</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-bold text-texte">{p.nom}</div>
                      {p.commune && <div className="text-[11px] text-texte-doux">{p.commune}</div>}
                    </div>
                    <span className="text-texte-tres-doux">{ICONS.chev(14)}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Brouillons abandonnés */}
          {abandonedDrafts.length > 0 && (
            <div className="px-4">
              <div
                className="overflow-hidden rounded-2xl border p-4"
                style={{ borderColor: '#F0D9B8', backgroundColor: '#FFF7E5' }}
              >
                <div className="mb-1 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#A8770F]">
                  {ICONS.draft(14)} Mes brouillons abandonnés
                </div>
                <p className="m-0 mb-2.5 text-[11px] leading-[1.4] text-[#7A5614]">
                  Fiches que tu as gérées par le passé. Tes modifs sont gardées si tu re-revendiques.
                </p>
                {abandonedDrafts.map(d => (
                  <Link
                    key={d.id}
                    href={`/etablissement/${d.etablissement.id}`}
                    className="flex items-center gap-3 py-2 text-inherit no-underline"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white text-[#A8770F]">
                      {d.etablissement.photos?.[0]
                        ? <img src={d.etablissement.photos[0]} alt="" className="h-full w-full object-cover" />
                        : ICONS.store(16)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="m-0 truncate text-[13px] font-bold text-texte">{d.etablissement.nom}</p>
                      <p className="m-0 text-[10px] text-texte-doux">Modifié {new Date(d.updated_at).toLocaleDateString('fr-FR')}</p>
                    </div>
                    <span className="text-texte-tres-doux">{ICONS.chev(14)}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* MenuList — actions principales */}
          <div className="px-4">
            <div
              className="overflow-hidden rounded-2xl border bg-white shadow-[0_1px_4px_rgba(44,28,16,0.04)]"
              style={{ borderColor: '#F0EAE0' }}
            >
              {currentPlan === 'pro' && (
                <MenuRow
                  icon={ICONS.leaf}
                  label="Ma fiche producteur"
                  sub="Gère ta vitrine, tes produits, ta carte"
                  onClick={() => setSubView('producteur')}
                />
              )}
              <MenuRow
                icon={ICONS.megaphone}
                label="Mes annonces"
                sub={activeAnnonceCount != null ? `${activeAnnonceCount} active${activeAnnonceCount > 1 ? 's' : ''}` : undefined}
                onClick={() => setSubView('annonces')}
              />
              <MenuRow
                icon={ICONS.cal}
                label="Événements suivis"
                sub={interestCount != null ? `${interestCount} événement${interestCount > 1 ? 's' : ''}` : undefined}
                onClick={() => setSubView('mes_events')}
              />
              <MenuRow
                icon={ICONS.group}
                label="Mes abonnements"
                sub={followingCount != null ? `${followingCount} personne${followingCount > 1 ? 's' : ''}` : undefined}
                onClick={() => setSubView('abonnements')}
              />
              <MenuRow
                icon={ICONS.life}
                label="Aide & support"
                sub="Nous contacter"
                onClick={() => { window.location.href = '/support' }}
              />
              <MenuRow
                icon={ICONS.rocket}
                label="Visibilité & boost"
                sub={plan === 'pro' ? 'Inclus dans votre plan' : 'Booster votre annonce'}
                onClick={() => { window.location.href = '/profil/visibilite' }}
                isLast={!isAdmin}
              />
            </div>
          </div>

          {/* Admin links — préservés */}
          {isAdmin && (
            <div className="px-4">
              <div
                className="overflow-hidden rounded-2xl border bg-white shadow-[0_1px_4px_rgba(44,28,16,0.04)]"
                style={{ borderColor: '#F0EAE0' }}
              >
                <div className="border-b px-4 pb-1.5 pt-3.5 text-[11px] font-extrabold uppercase tracking-[0.1em] text-texte-doux" style={{ borderColor: '#F0EAE0' }}>
                  Administration
                </div>
                <MenuRow
                  icon={ICONS.shield}
                  label="Tableau de bord admin"
                  sub="Membres, demandes, scraping, inbox"
                  href="/admin"
                />
                <MenuRow
                  icon={ICONS.star}
                  label="Hub carousel"
                  sub="Mise en avant éditoriale"
                  href="/admin/hub-carousel"
                />
                <MenuRow
                  icon={ICONS.journal}
                  label="Journal du Village"
                  sub="Numéros hebdo, modération articles"
                  href="/admin/journal"
                />
                <MenuRow
                  icon={ICONS.chat}
                  label="Tickets support"
                  sub="Messages des utilisateurs"
                  href="/admin/support"
                  badge={supportUnread > 0 ? (supportUnread > 99 ? '99+' : String(supportUnread)) : undefined}
                  isLast
                />
              </div>
            </div>
          )}

          {/* Sign out */}
          <div className="px-4">
            <div
              className="overflow-hidden rounded-2xl border bg-white shadow-[0_1px_4px_rgba(44,28,16,0.04)]"
              style={{ borderColor: '#F0EAE0' }}
            >
              <MenuRow
                icon={ICONS.logout}
                label={signingOut ? 'Déconnexion…' : 'Se déconnecter'}
                sub={user.email ?? undefined}
                onClick={handleSignOut}
                danger
                isLast
              />
            </div>
          </div>
        </div>
      )}

      {tab === 'reglages' && (
        <div className="flex flex-col gap-3 pt-2">
          <div className="px-4">
            <div
              className="rounded-2xl border bg-white p-4 shadow-[0_1px_4px_rgba(44,28,16,0.04)]"
              style={{ borderColor: '#F0EAE0' }}
            >
              <div className="mb-3 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.1em] text-texte-doux">
                {ICONS.palette(14)} Apparence
              </div>

              <div className="mb-2 text-[12px] font-bold text-texte">Couleur</div>
              <div className="mb-3.5 grid grid-cols-5 gap-2">
                {COLOR_THEMES.map(t => {
                  const active = theme.colorTheme.id === t.id
                  return (
                    <button
                      key={t.id}
                      onClick={() => theme.setColorThemeId(t.id)}
                      className="flex flex-col items-center gap-1 rounded-xl border-none p-2"
                      style={{
                        backgroundColor: active ? t.primaryLight : 'transparent',
                        outline: active ? `2px solid ${t.primary}` : '1.5px solid #F0EAE0',
                      }}
                    >
                      <div className="h-8 w-8 rounded-full" style={{ backgroundColor: t.primary }} />
                      <span className="text-center text-[9px] font-bold" style={{ color: active ? t.primary : '#7A6A5A' }}>
                        {t.name}
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="mb-2 text-[12px] font-bold text-texte">Fond de liste</div>
              <div className="mb-3.5 grid grid-cols-3 gap-2">
                {SHEET_BG_OPTIONS.map(opt => {
                  const active = theme.sheetBg.id === opt.id
                  return (
                    <button
                      key={opt.id}
                      onClick={() => theme.setSheetBgId(opt.id)}
                      className="flex flex-col items-center gap-1.5 rounded-xl border-none p-2"
                      style={{
                        backgroundColor: active ? 'var(--primary-light)' : 'transparent',
                        outline: active ? '2px solid var(--primary)' : '1.5px solid #F0EAE0',
                      }}
                    >
                      <div className="h-[22px] w-[38px] rounded-md border" style={{ backgroundColor: opt.bg, borderColor: opt.border }} />
                      <span className="text-[10px] font-bold" style={{ color: active ? 'var(--primary)' : '#7A6A5A' }}>
                        {opt.name}
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="mb-2 text-[12px] font-bold text-texte">Style de carte</div>
              <div className="flex flex-col gap-1.5">
                {MAP_STYLES.map(s => {
                  const active = theme.mapStyle.id === s.id
                  return (
                    <button
                      key={s.id}
                      onClick={() => theme.setMapStyleId(s.id)}
                      className="flex items-center gap-3 rounded-xl border-none px-3 py-2.5 text-left"
                      style={{
                        backgroundColor: active ? 'var(--primary-light)' : '#FDFAF5',
                        outline: active ? '2px solid var(--primary)' : '1.5px solid transparent',
                      }}
                    >
                      <div className="h-7 w-9 shrink-0 rounded-md" style={{ backgroundColor: s.previewBg }} />
                      <div className="flex-1">
                        <p className="m-0 text-[12px] font-bold" style={{ color: active ? 'var(--primary)' : '#1A1209' }}>{s.name}</p>
                        <p className="m-0 mt-px text-[10px] text-texte-doux">{s.description}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="px-4 pb-3 pt-2 text-center text-[10px] leading-[1.6] text-texte-doux">
            La Place du Village<br />
            Fait avec soin à Ganges
          </div>
        </div>
      )}

      {/* Modals */}
      {showUpgrade && (
        <SubscriptionModal
          context={{ kind: 'generic' }}
          onClose={() => setShowUpgrade(false)}
          currentPlan={currentPlan}
        />
      )}
      {editOpen && (
        <EditProfileModal
          initialName={profile?.display_name ?? ''}
          email={user.email ?? ''}
          avatarUrl={profile?.avatar_url ?? null}
          onClose={() => setEditOpen(false)}
          onSave={async (name) => {
            if (name.trim() && name.trim() !== profile?.display_name) {
              await updateDisplayName(name.trim())
            }
            setEditOpen(false)
          }}
        />
      )}
    </div>
  )
}

/* ─── MenuRow V3 ─────────────────────────────────────────────────────── */

function MenuRow({
  icon, label, sub, onClick, href, badge, danger, isLast,
}: {
  icon:   IconRenderer
  label:  string
  sub?:   string
  onClick?:() => void
  href?:  string
  badge?: string
  danger?:boolean
  isLast?:boolean
}) {
  const body = (
    <>
      <div
        className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px]"
        style={{
          backgroundColor: danger ? '#FBE9E5' : '#F7F1E6',
          color: danger ? '#B53A22' : '#2D5A3D',
        }}
      >
        {icon(18)}
      </div>
      <div className="min-w-0 flex-1 text-left">
        <div
          className="text-[14px] font-bold"
          style={{ color: danger ? '#B53A22' : '#1A1209' }}
        >
          {label}
        </div>
        {sub && <div className="mt-0.5 truncate text-[11px] text-texte-doux">{sub}</div>}
      </div>
      {badge && (
        <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-extrabold text-white">
          {badge}
        </span>
      )}
      <span className="text-texte-tres-doux">{ICONS.chev(14)}</span>
    </>
  )

  const className = `flex w-full items-center gap-3 bg-transparent px-4 py-3.5 text-inherit no-underline ${
    !isLast ? 'border-b' : ''
  }`
  const style = !isLast ? { borderColor: '#F0EAE0' } : undefined

  if (href) {
    return (
      <Link href={href} className={className} style={style}>
        {body}
      </Link>
    )
  }
  return (
    <button onClick={onClick} className={className} style={style}>
      {body}
    </button>
  )
}

/* ─── SubViewWrap V3 ─────────────────────────────────────────────────── */

function SubViewWrap({
  title, onBack, children,
}: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-creme font-inter">
      <div className="flex items-center gap-2.5 px-4 pt-3.5">
        <button
          onClick={onBack}
          aria-label="Retour"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-bord bg-white text-texte shadow-[0_1px_2px_rgba(44,28,16,0.04)]"
        >
          {ICONS.back(20)}
        </button>
        <h1 className="m-0 flex-1 truncate font-serif text-[18px] leading-none text-texte" style={{ letterSpacing: '-0.01em' }}>
          {title}
        </h1>
      </div>
      <div className="pt-3">{children}</div>
    </div>
  )
}
