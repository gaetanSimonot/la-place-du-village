'use client'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useInterceptModal } from '@/contexts/InterceptModalContext'

interface Props {
  /** Si fourni, override le click par défaut (router.push) — le hub pilote son
   *  state interne sans changer d'URL. */
  onNavigate?: (tabId: string) => void
  /** Si fourni, force le highlight d'un onglet (sinon basé sur le pathname). */
  activeTab?: string
  /** Action du bouton central « + » (variante carte/annonces). Si absent, défaut
   *  contextuel (annonces → /annonces/nouvelle). */
  onPlus?: () => void
  /** Force la variante « + » (ex. quand le splash est affiché). */
  forcePlus?: boolean
}

/**
 * Bottom nav PLATE, contextuelle. Deux jeux d'onglets :
 *  - défaut (accueil / profil / favoris / autres) : Accueil · Carte · Annonces ·
 *    Favoris · Profil.
 *  - carte / annonces : Accueil · Carte · ➕ · Annonces · Profil (le ➕ remplace
 *    la place du milieu, Favoris cède sa place à Annonces). Le ➕ est un onglet
 *    normal (rond vert inline, PAS de bosse flottante). Action : carte → onPlus
 *    (menu Publier) ; annonces → /annonces/nouvelle par défaut.
 * Badge non-lu (parmi les 50 notifs récentes) porté par Profil, masqué quand on
 * est déjà sur le profil (la cloche de l'en-tête l'affiche).
 */

type TabDef = { id: string; label: string; href: string; active: boolean; badge?: number; plus?: boolean; Icon: () => React.JSX.Element }

const Icons = {
  accueil: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1V9.5z"/>
    </svg>
  ),
  carte: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
      <line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>
    </svg>
  ),
  annonces: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41L13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
      <line x1="7" y1="7" x2="7.01" y2="7"/>
    </svg>
  ),
  favoris: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  ),
  profil: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
    </svg>
  ),
}

export default function BottomNavBar({ onNavigate, activeTab, onPlus, forcePlus }: Props = {}) {
  const router = useRouter()
  const pathname = usePathname()
  const { user } = useAuth()
  const intercept = useInterceptModal()
  const [notifCount, setNotifCount] = useState(0)
  const instanceIdRef = useRef<string>(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2),
  )

  // Badge : non-lus parmi les 50 notifs les plus récentes (= ce que l'user voit).
  useEffect(() => {
    if (!user) { setNotifCount(0); return }
    const refresh = () => {
      supabase.from('notifications')
        .select('lu')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50)
        .then(({ data }) => setNotifCount((data ?? []).filter(r => !r.lu).length))
    }
    refresh()
    const ch = supabase
      .channel(`bn-notifs-${user.id}-${instanceIdRef.current}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, refresh)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [user])

  const isAnnonces = pathname?.startsWith('/annonces') ?? false
  const onProfil = activeTab === 'profil'
  // Onglet « + » au milieu : sur la carte (hub) ou la section annonces — SAUF
  // sur la page de création elle-même (sinon le + se pointerait sur lui-même).
  const isPlus = forcePlus || activeTab === 'carte' || (isAnnonces && pathname !== '/annonces/nouvelle')
  const profilBadge = !onProfil ? notifCount : 0

  const go = (href: string, id?: string) => {
    if (id && onNavigate) { onNavigate(id); return }
    if (intercept) { router.replace(href); return }
    router.push(href)
  }

  const handlePlus = () => {
    if (onPlus) { onPlus(); return }
    if (isAnnonces) { router.push('/annonces/nouvelle'); return }
    router.push('/ajouter')
  }

  const tabs: TabDef[] = isPlus
    ? [
        { id: 'accueil',  label: 'Accueil',  href: '/',            active: false,      Icon: Icons.accueil },
        { id: 'carte',    label: 'Carte',    href: '/?tab=carte',  active: false,      Icon: Icons.carte },
        { id: 'plus',     label: 'Ajouter',  href: '',             active: false, plus: true, Icon: Icons.accueil },
        { id: 'annonces', label: 'Annonces', href: '/annonces',    active: isAnnonces, Icon: Icons.annonces },
        { id: 'profil',   label: 'Profil',   href: '/?tab=profil', active: false, badge: profilBadge, Icon: Icons.profil },
      ]
    : [
        { id: 'accueil',  label: 'Accueil',  href: '/',            active: false,      Icon: Icons.accueil },
        { id: 'carte',    label: 'Carte',    href: '/?tab=carte',  active: false,      Icon: Icons.carte },
        { id: 'annonces', label: 'Annonces', href: '/annonces',    active: isAnnonces, Icon: Icons.annonces },
        { id: 'favoris',  label: 'Favoris',  href: '/?tab=favoris', active: false,     Icon: Icons.favoris },
        { id: 'profil',   label: 'Profil',   href: '/?tab=profil',  active: false, badge: profilBadge, Icon: Icons.profil },
      ]

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, height: 64,
      backgroundColor: '#fff', borderTop: '1px solid #EDE8E0',
      display: 'flex', zIndex: 50, paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {tabs.map(t => {
        // ── Onglet « + » (rond vert inline) ──
        if (t.plus) {
          return (
            <button
              key="plus"
              onClick={handlePlus}
              aria-label="Ajouter"
              style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 2,
                border: 'none', backgroundColor: 'transparent', cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span style={{
                width: 38, height: 38, borderRadius: '50%',
                background: 'linear-gradient(135deg, #3C7A50, #2D5A3D)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(45,90,61,0.30)',
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#2D5A3D' }}>Ajouter</span>
            </button>
          )
        }

        // ── Onglet normal ──
        const isActive = activeTab ? activeTab === t.id : t.active
        return (
          <button
            key={t.id}
            onClick={() => go(t.href, t.id)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 3,
              border: 'none', backgroundColor: 'transparent', cursor: 'pointer',
              borderTop: isActive ? '2.5px solid #2D5A3D' : '2.5px solid transparent',
              paddingBottom: 4,
              color: isActive ? '#2D5A3D' : '#8A8A8A',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <div style={{ position: 'relative', display: 'inline-flex' }}>
              <t.Icon />
              {t.badge && t.badge > 0 ? (
                <span style={{
                  position: 'absolute', top: -4, right: -5,
                  minWidth: 16, height: 16, borderRadius: 8,
                  backgroundColor: '#E53935', color: '#fff', fontSize: 9, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 3px', border: '1.5px solid #fff',
                }}>{t.badge > 99 ? '99+' : t.badge}</span>
              ) : null}
            </div>
            <span style={{ fontSize: 10, fontWeight: 700 }}>{t.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
