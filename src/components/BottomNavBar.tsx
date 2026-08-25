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
  /** Action du « + » fournie par le shell home (menu Publier). Sinon, action
   *  CONTEXTUELLE selon la page : annonces → nouvelle annonce, bons plans →
   *  flux pro (event 'pdv-plus-promos'), défaut → /ajouter. */
  onPlus?: () => void
  forcePlus?: boolean
}

/**
 * Bottom nav — 5 onglets : Carte · Bons plans · ➕ · Favoris · Village.
 * Le ➕ est contextuel (lié à l'écran courant). Notifs/réglages via le Profil
 * (bouton en haut du Village).
 */

type TabDef = { id: string; label: string; href: string; active: boolean; badge?: number; plus?: boolean; Icon: () => React.JSX.Element }

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
  favoris: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  ),
}

export default function BottomNavBar({ onNavigate, activeTab, onPlus }: Props = {}) {
  const router = useRouter()
  const pathname = usePathname()
  const { user } = useAuth()
  const intercept = useInterceptModal()
  const [notifCount, setNotifCount] = useState(0)
  const navRef = useRef<HTMLElement>(null)
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

  /**
   * iOS n'applique `:active` qu'aux éléments dont un ancêtre écoute le
   * toucher. Sans ce listener — vide, passif, posé une fois sur la barre —
   * l'enfoncement au doigt marcherait sur Android et pas sur iPhone.
   */
  useEffect(() => {
    const el = navRef.current
    if (!el) return
    const noop = () => {}
    el.addEventListener('touchstart', noop, { passive: true })
    return () => el.removeEventListener('touchstart', noop)
  }, [])

  const isPromotions = pathname?.startsWith('/promotions') ?? false
  const isAnnonces = pathname?.startsWith('/annonces') ?? false
  const onVillageish = activeTab === 'village' || activeTab === 'profil' || activeTab === 'notifs'

  const go = (href: string, id: string) => {
    setPendingTab(id)
    if (onNavigate) { onNavigate(id); return }
    if (intercept) { router.replace(href); return }
    router.push(href)
  }

  /**
   * Une secousse de 10 ms au doigt, sur le « + » seulement.
   *
   * C'est le geste d'engagement de la barre — les quatre onglets vibrants
   * feraient du bruit. Sans effet sur iPhone (Safari n'implémente pas
   * l'API) et sur les navigateurs de bureau : l'appel est simplement ignoré.
   */
  const vibrer = () => {
    try { navigator.vibrate?.(10) } catch { /* refusé par le navigateur : tant pis */ }
  }

  // « + » CONTEXTUEL : lié à ce qui est à l'écran.
  const handlePlus = () => {
    if (onPlus) { onPlus(); return }                                   // shell home → menu Publier
    if (isAnnonces && pathname !== '/annonces/nouvelle') { router.push('/annonces/nouvelle'); return }
    if (isPromotions) { window.dispatchEvent(new Event('pdv-plus-promos')); return }  // géré par la page (pro → fiche, sinon pitch pro)
    router.push('/ajouter')
  }

  /**
   * Le cœur des favoris bat une seconde quand quelque chose vient d'y entrer.
   *
   * On peut désormais garder une sortie depuis l'Assistant Village sans
   * quitter la conversation : sans ce signe, rien ne dit où elle est allée.
   * L'événement est global — n'importe quel écran peut le déclencher, la nav
   * n'a pas à savoir qui.
   */
  /**
   * L'onglet s'allume au doigt, pas à l'arrivée de la page.
   *
   * Sur les ~20 écrans qui montent cette barre sans `activeTab`, taper
   * « Carte » lançait un router.push et laissait l'onglet gris tout le temps
   * du chargement : rien ne disait que le tap avait été pris. On peint donc
   * l'onglet demandé tout de suite, et on lâche dès que la page a suivi.
   *
   * Le filet de 2,5 s couvre la navigation qui n'aboutit pas (route
   * interceptée, retour arrière) : sans lui, l'onglet resterait allumé sur
   * une page où l'on n'est pas.
   */
  const [pendingTab, setPendingTab] = useState<string | null>(null)
  useEffect(() => { setPendingTab(null) }, [pathname, activeTab])
  useEffect(() => {
    if (!pendingTab) return
    const t = setTimeout(() => setPendingTab(null), 2500)
    return () => clearTimeout(t)
  }, [pendingTab])

  const [batFavori, setBatFavori] = useState(false)
  useEffect(() => {
    const onFavori = () => {
      setBatFavori(true)
      const t = setTimeout(() => setBatFavori(false), 1100)
      return () => clearTimeout(t)
    }
    window.addEventListener('lpv:favori', onFavori)
    return () => window.removeEventListener('lpv:favori', onFavori)
  }, [])

  const tabs: TabDef[] = [
    { id: 'carte',     label: 'Carte',      href: '/?tab=carte',    active: false,        Icon: Icons.carte },
    { id: 'bonsplans', label: 'Bons plans', href: '/promotions',    active: isPromotions, Icon: Icons.gift },
    { id: 'plus',      label: 'Ajouter',    href: '',               active: false, plus: true, Icon: Icons.carte },
    { id: 'favoris',   label: 'Favoris',    href: '/?tab=favoris',  active: false,        Icon: Icons.favoris },
    { id: 'village',   label: 'Village',    href: '/?tab=village',  active: false, badge: onVillageish ? 0 : notifCount, Icon: Icons.village },
  ]

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, height: 64,
      // Couleurs par variables : l'univers cinéma les redéfinit le temps de
      // la visite (voir globals.css, html[data-univers="cinema"]). Le repli
      // après la virgule est la valeur normale de l'app.
      backgroundColor: 'var(--nav-bg, #fff)', borderTop: '1px solid var(--nav-bord, #EDE8E0)',
      display: 'flex', zIndex: 50, paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {tabs.map(t => {
        // ── Onglet « + » (rond vert inline, action contextuelle) ──
        if (t.plus) {
          return (
            <button
              key="plus"
              className="lpv-tap-fab"
              onClick={handlePlus}
              onPointerDown={vibrer}
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
                background: 'var(--nav-fab-bg, linear-gradient(135deg, #3C7A50, #2D5A3D))', color: 'var(--nav-fab-ink, #fff)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(45,90,61,0.30)',
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--nav-actif, #2D5A3D)' }}>Ajouter</span>
            </button>
          )
        }

        /* L'onglet en attente est exclusif : tant qu'il tient, lui seul est
           allumé. Sinon, taper vite d'un onglet à l'autre laissait le
           précédent marqué — encore actif car la page n'avait pas suivi —
           et deux onglets portaient le signe en même temps. */
        const isActive = pendingTab
          ? pendingTab === t.id
          : (activeTab ? activeTab === t.id : t.active)
        return (
          <button
            key={t.id}
            className="lpv-tap"
            onClick={() => go(t.href, t.id)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 3,
              border: 'none', backgroundColor: 'transparent', cursor: 'pointer',
              paddingTop: 2.5, paddingBottom: 4,
              // La couleur passe par une variable, pas par `color` : la règle
              // :active de .lpv-tap doit pouvoir la reprendre à l'appui, et un
              // `color` inline gagnerait contre elle.
              ['--tab-ink' as string]: isActive ? 'var(--nav-actif, #2D5A3D)' : 'var(--nav-inactif, #8A8A8A)',
              WebkitTapHighlightColor: 'transparent',
            } as React.CSSProperties}
          >
            <div style={{ position: 'relative', display: 'inline-flex' }}>
              {/* La pastille — un fond posé derrière la seule icône, qui ne
                  remplit pas la tuile. Elle arrive 70 ms après le vert : le
                  doigt est parti, l'icône remonte, puis le fond se pose.
                  À l'extinction, aucun délai et un fondu court — passer vite
                  d'un onglet à l'autre doit couper net, pas superposer deux
                  animations. */}
              <span
                aria-hidden
                className="lpv-pastille"
                style={{
                  position: 'absolute', left: '50%', top: '50%',
                  width: 46, height: 30, marginLeft: -23, marginTop: -15,
                  borderRadius: 15, pointerEvents: 'none',
                  backgroundColor: 'var(--nav-pastille, rgba(45, 90, 61, .13))',
                  opacity: isActive ? 1 : 0,
                  transform: isActive ? 'scale(1)' : 'scale(.72)',
                  transition: isActive
                    ? 'opacity 150ms ease-out 70ms, transform 240ms cubic-bezier(.22,1,.36,1) 70ms'
                    : 'opacity 90ms ease-out, transform 90ms ease-out',
                }}
              />
              <span style={
                t.id === 'favoris' && batFavori
                  ? { position: 'relative', color: '#C84B2F', display: 'inline-flex', transformOrigin: 'center', animation: 'lpv-battement .55s ease-in-out 2' }
                  : { position: 'relative', display: 'inline-flex' }
              }>
                <t.Icon />
              </span>
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
            <span style={{ fontSize: 10, fontWeight: 700, color: t.id === 'favoris' && batFavori ? '#C84B2F' : undefined }}>{t.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
