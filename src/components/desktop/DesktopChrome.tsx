'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import HubSearchModal from '@/components/HubSearchModal'

/**
 * CHÂSSIS BUREAU — en-tête + bandeau de contexte.
 *
 * Monté pour tout le monde, mais `.pcv-only` le masque en dessous de 1024 px
 * (voir desktop.css). Aucun rendu conditionnel en JavaScript : c'est la
 * requête média qui décide, donc pas d'écart entre le rendu serveur et le
 * rendu client, et pas de clignotement au chargement.
 *
 * Sur mobile, la navigation reste la barre du bas ; celle-ci est masquée au
 * même point de rupture. Les deux ne coexistent jamais.
 */

/** Onglets principaux. Chaque adresse existe déjà — rien n'est inventé. */
const ONGLETS: { label: string; href: string; actif: (p: string, vue: string) => boolean }[] = [
  // ?tab=village existe déjà côté accueil (page.tsx) : il pose l'onglet
  // puis nettoie l'URL. Rien à inventer.
  //
  // `vue` est l'onglet réellement ouvert dans la coquille d'accueil, publié
  // sur <html data-vue>. On ne peut pas le lire dans l'URL : la
  // synchronisation y écrit toujours ?mode=agenda, même sur Le village.
  { label: 'Le village',  href: '/?tab=village',          actif: (p, vue) => p === '/' && vue === 'village' },
  { label: 'Carte',       href: '/?mode=agenda',          actif: (p, vue) => p === '/' && vue === 'carte' },
  { label: 'Bons plans',  href: '/promotions',            actif: p => p.startsWith('/promotions') },
  { label: 'Annonces',    href: '/annonces',              actif: p => p.startsWith('/annonces') },
]

/** Le reste du village, replié — le menu du haut ne doit pas déborder. */
const PLUS: { label: string; href: string }[] = [
  { label: 'Commerces',        href: '/?mode=annuaire' },
  { label: 'Producteurs',      href: '/?mode=annuaire&ann=producteurs' },
  { label: 'Le journal',       href: '/journal' },
  { label: 'Forum du village', href: '/forum' },
  { label: 'Covoiturage',      href: '/covoiturage' },
  { label: 'Les voisins',      href: '/people' },
]

function IconeChevron({ ouvert }: { ouvert: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
         style={{ transition: 'transform .15s', transform: ouvert ? 'rotate(180deg)' : 'none' }}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

/** Zone d'affichage choisie par la personne, sinon le réglage par défaut. */
function useZone(): { nom: string; rayon: number } {
  const [zone, setZone] = useState({ nom: 'Ganges', rayon: 30 })
  useEffect(() => {
    try {
      const brut = localStorage.getItem('pdv-zone-user')
      if (!brut) return
      const z = JSON.parse(brut) as { nom?: string; rayon?: number }
      setZone({ nom: z.nom?.trim() || 'Ganges', rayon: z.rayon ?? 30 })
    } catch { /* zone par défaut */ }
  }, [])
  return zone
}

/** Onglet ouvert dans la coquille d'accueil, publié sur <html data-vue>. */
function useVue(): string {
  const [vue, setVue] = useState('')
  useEffect(() => {
    const lire = () => setVue(document.documentElement.dataset.vue ?? '')
    lire()
    const obs = new MutationObserver(lire)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-vue'] })
    return () => obs.disconnect()
  }, [])
  return vue
}

export default function DesktopChrome() {
  const pathname = usePathname() ?? '/'
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user, profile } = useAuth()
  const { openAuthModal } = useAuthModal()
  const zone = useZone()
  const vue = useVue()

  const [plusOuvert, setPlusOuvert] = useState(false)
  const [rechercheOuverte, setRechercheOuverte] = useState(false)
  const plusRef = useRef<HTMLDivElement | null>(null)

  // Le menu se referme au clic ailleurs et sur Échap.
  useEffect(() => {
    if (!plusOuvert) return
    const clic = (e: MouseEvent) => {
      if (plusRef.current && !plusRef.current.contains(e.target as Node)) setPlusOuvert(false)
    }
    const touche = (e: KeyboardEvent) => { if (e.key === 'Escape') setPlusOuvert(false) }
    document.addEventListener('mousedown', clic)
    window.addEventListener('keydown', touche)
    return () => { document.removeEventListener('mousedown', clic); window.removeEventListener('keydown', touche) }
  }, [plusOuvert])

  // Toute navigation referme le menu.
  useEffect(() => { setPlusOuvert(false) }, [pathname, searchParams])

  const initiale = (profile?.display_name || user?.email || '·').trim().charAt(0).toUpperCase()

  const dateDuJour = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  return (
    <>
      <header className="pcv-only pcv-hd">
        <div className="pcv-hdIn">
          <Link href="/" aria-label="La Place du Village">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-topbar.webp" alt="La Place du Village" className="pcv-logo" />
          </Link>

          <nav className="pcv-nav">
            {ONGLETS.map(o => (
              <Link
                key={o.label}
                href={o.href}
                className={o.actif(pathname, vue) ? 'pcv-on' : undefined}
              >
                {o.label}
              </Link>
            ))}

            <div className="pcv-plus" ref={plusRef} data-open={plusOuvert ? '1' : '0'}>
              <button
                type="button"
                className="pcv-plusB"
                aria-expanded={plusOuvert}
                aria-haspopup="menu"
                onClick={() => setPlusOuvert(o => !o)}
              >
                Plus <IconeChevron ouvert={plusOuvert} />
              </button>
              {plusOuvert && (
                <div className="pcv-plusM" role="menu">
                  {PLUS.map(l => (
                    <Link key={l.href} href={l.href} role="menuitem">{l.label}</Link>
                  ))}
                </div>
              )}
            </div>
          </nav>

          <div className="pcv-hdR">
            <button
              type="button"
              className="pcv-srch"
              onClick={() => setRechercheOuverte(true)}
              aria-label="Rechercher"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span>Rechercher…</span>
            </button>

            <Link href="/ajouter" className="pcv-btnP">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2.6" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Publier</span>
            </Link>

            {user ? (
              <Link href="/profil" className="pcv-av" aria-label="Mon profil">
                {profile?.avatar_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={profile.avatar_url} alt="" />
                  : initiale}
              </Link>
            ) : (
              <button type="button" className="pcv-av" onClick={() => openAuthModal()} aria-label="Se connecter">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Bandeau de contexte — remplace l'en-tête de l'app mobile. */}
      <div className="pcv-only pcv-ctx">
        <div className="pcv-ctxIn">
          <span className="pcv-ctxLieu">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s-7-7.5-7-12a7 7 0 0 1 14 0c0 4.5-7 12-7 12z" /><circle cx="12" cy="10" r="2.5" />
            </svg>
            <b>{zone.nom}</b> et {zone.rayon} km autour
            {/* La zone se règle sur la carte, où vit le sélecteur. */}
            <Link href="/?mode=agenda" style={{ color: '#2D5A3D', fontWeight: 700 }}>· Changer</Link>
          </span>
          <span style={{ textTransform: 'capitalize' }}>{dateDuJour}</span>
        </div>
      </div>

      {/* Recherche globale — le même écran que la loupe du mobile. */}
      <HubSearchModal
        open={rechercheOuverte}
        onClose={() => setRechercheOuverte(false)}
        onViewAll={(kind, query) => {
          setRechercheOuverte(false)
          const q = encodeURIComponent(query)
          if (kind === 'evenement')          router.push('/?mode=agenda')
          else if (kind === 'etablissement') router.push(`/?mode=annuaire&q=${q}`)
          else                               router.push(`/?mode=annuaire&ann=producteurs&q=${q}`)
        }}
      />
    </>
  )
}
