'use client'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useInterceptModal } from '@/contexts/InterceptModalContext'

interface Props {
  /** Override du click (le shell home pilote son state interne sans changer d'URL). */
  onNavigate?: (tabId: string) => void
  /** Force le highlight d'un onglet (sinon basé sur le pathname). */
  activeTab?: string
  /** @deprecated — le « + » est désormais sur la carte (refonte app simple). */
  onPlus?: () => void
  forcePlus?: boolean
}

/**
 * Bottom nav SIMPLE — 3 onglets : Carte · Bons plans · Village.
 * (Refonte « app simple » : plus de Hub/Accueil, plus de « + » — publier se fait
 *  depuis la carte. Favoris / notifs / réglages sont dans le Profil, accessible
 *  depuis le Village.)
 */

type TabDef = { id: string; label: string; href: string; active: boolean; badge?: number; Icon: () => React.JSX.Element }

const Icons = {
  carte: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
      <line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>
    </svg>
  ),
  gift: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/>
      <line x1="12" y1="22" x2="12" y2="7"/>
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
    </svg>
  ),
  village: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
}

export default function BottomNavBar({ onNavigate, activeTab }: Props = {}) {
  const router = useRouter()
  const pathname = usePathname()
  const { user } = useAuth()
  const intercept = useInterceptModal()
  const [notifCount, setNotifCount] = useState(0)
  const instanceIdRef = useRef<string>(
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
  )

  // Badge non-lu (porté par Village → mène au Profil → notifs).
  useEffect(() => {
    if (!user) { setNotifCount(0); return }
    const refresh = () => {
      supabase.from('notifications').select('lu').eq('user_id', user.id)
        .order('created_at', { ascending: false }).limit(50)
        .then(({ data }) => setNotifCount((data ?? []).filter(r => !r.lu).length))
    }
    refresh()
    const ch = supabase
      .channel(`bn-notifs-${user.id}-${instanceIdRef.current}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, refresh)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [user])

  const isPromotions = pathname?.startsWith('/promotions') ?? false
  const onVillageish = activeTab === 'village' || activeTab === 'profil' || activeTab === 'notifs' || activeTab === 'favoris'

  const go = (href: string, id: string) => {
    if (onNavigate) { onNavigate(id); return }
    if (intercept) { router.replace(href); return }
    router.push(href)
  }

  const tabs: TabDef[] = [
    { id: 'carte',     label: 'Carte',      href: '/?tab=carte',   active: false,        Icon: Icons.carte },
    { id: 'bonsplans', label: 'Bons plans', href: '/promotions',   active: isPromotions, Icon: Icons.gift },
    { id: 'village',   label: 'Village',    href: '/?tab=village',  active: false, badge: onVillageish ? 0 : notifCount, Icon: Icons.village },
  ]

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, height: 64,
      backgroundColor: '#fff', borderTop: '1px solid #EDE8E0',
      display: 'flex', zIndex: 50, paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {tabs.map(t => {
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
