'use client'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useInterceptModal } from '@/contexts/InterceptModalContext'

interface Props {
  /** Si fourni, override le click par défaut (router.push) — utile pour le hub
   *  qui veut piloter son state interne sans changer d'URL. */
  onNavigate?: (tabId: string) => void
  /** Si fourni, force le highlight d'un onglet (sinon basé sur le pathname). */
  activeTab?: string
}

/**
 * Bottom nav réutilisable, path-aware partout sauf si props override.
 * Tabs : Accueil / Carte / Annonces / Favoris / Profil
 * (Les notifs ne sont plus un onglet : le badge non-lu est porté par Profil,
 *  et la vue s'ouvre via la cloche dans l'en-tête du profil.)
 */
export default function BottomNavBar({ onNavigate, activeTab }: Props = {}) {
  const router = useRouter()
  const pathname = usePathname()
  const { user } = useAuth()
  // Présent UNIQUEMENT quand cette nav est rendue à l'intérieur d'une
  // intercepting modal (fiche commerce ouverte par-dessus la home).
  // Dans ce cas, un push() simple ne ferme PAS le slot @modal → on doit
  // d'abord fermer la modale (back), PUIS pousser la destination.
  const intercept = useInterceptModal()
  const [notifCount, setNotifCount] = useState(0)
  // Identifiant unique par instance — évite les conflits si plusieurs
  // BottomNavBar montent simultanément (navigation Next.js) qui partageraient
  // le même nom de channel et causeraient "cannot add postgres_changes
  // callbacks after subscribe()".
  const instanceIdRef = useRef<string>(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2),
  )

  // Compteur unread temps réel pour le badge cloche
  useEffect(() => {
    if (!user) { setNotifCount(0); return }

    supabase.from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('lu', false)
      .then(({ count }) => setNotifCount(count ?? 0))

    const ch = supabase
      .channel(`bn-notifs-${user.id}-${instanceIdRef.current}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        supabase.from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id).eq('lu', false)
          .then(({ count }) => setNotifCount(count ?? 0))
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [user])

  const isAnnonces = pathname?.startsWith('/annonces') ?? false

  const tabs: { id: string; label: string; href: string; active: boolean; badge?: number; Icon: () => React.JSX.Element }[] = [
    {
      id: 'accueil',
      label: 'Accueil',
      href: '/',
      active: false,
      Icon: () => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1V9.5z"/>
        </svg>
      ),
    },
    {
      id: 'carte',
      label: 'Carte',
      href: '/?tab=carte',
      active: false,
      Icon: () => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
          <line x1="9" y1="3" x2="9" y2="18"/>
          <line x1="15" y1="6" x2="15" y2="21"/>
        </svg>
      ),
    },
    {
      id: 'annonces',
      label: 'Annonces',
      href: '/annonces',
      active: isAnnonces,
      Icon: () => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.59 13.41L13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
          <line x1="7" y1="7" x2="7.01" y2="7"/>
        </svg>
      ),
    },
    {
      id: 'favoris',
      label: 'Favoris',
      href: '/?tab=favoris',
      active: false,
      Icon: () => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
      ),
    },
    {
      id: 'profil',
      label: 'Profil',
      href: '/?tab=profil',
      active: false,
      badge: notifCount,   // le badge notifs vit désormais sur le symbole Profil
      Icon: () => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4"/>
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
        </svg>
      ),
    },
  ]

  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0, left: 0, right: 0,
        height: 64,
        backgroundColor: '#fff',
        borderTop: '1px solid #EDE8E0',
        display: 'flex',
        zIndex: 50,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {tabs.map(t => {
        // active : si activeTab fourni, on l'utilise (mode hub interne) ;
        // sinon fallback sur la détection par pathname (autres routes).
        const isActive = activeTab ? activeTab === t.id : t.active
        return (
        <button
          key={t.id}
          onClick={() => {
            if (onNavigate) { onNavigate(t.id); return }
            if (intercept) {
              // Dans une intercepting modal : router.replace échange
              // l'entrée fiche contre la destination → historique propre
              // [..., liste/carte, destination], pas [..., liste, fiche,
              // destination]. La garde pathname du shell render null dès
              // que l'URL change → fiche démontée au 1er clic. Pas de
              // back+timeout, donc pas de course (le back précédent
              // écrasait le push, d'où le bug "2 clics requis").
              router.replace(t.href)
              return
            }
            router.push(t.href)
          }}
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
                backgroundColor: '#E53935', color: '#fff',
                fontSize: 9, fontWeight: 800,
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
