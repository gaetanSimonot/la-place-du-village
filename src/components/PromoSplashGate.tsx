'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { trackEvent } from '@/lib/analytics'
import SplashPromoView from './SplashPromoView'
import SubscriptionModal from './SubscriptionModal'
import {
  parseSplashPromo, variantTrackName,
  type SplashPromoConfig, type SplashPromoVariantId,
} from '@/lib/splashPromo'
import {
  countSessionOnce, nextVariant, readPromoSplashState, recordShown,
} from '@/lib/promoSplashState'

/**
 * Décide si, quand et quelle variante de splash promo afficher.
 *
 * Monté une seule fois dans le layout : un seul splash peut donc exister à la
 * fois, quelle que soit la navigation. Le composant visuel (SplashPromoView)
 * ne connaît aucune de ces règles.
 *
 * Ordre des refus, du moins cher au plus cher :
 *   1. splashs désactivés en admin ;
 *   2. abonné payant (Habitant ou Partenaire) ;
 *   3. déjà montré dans cette session ;
 *   4. cooldown / pause de fin de cycle non écoulés ;
 *   5. nouveau venu qui n'a pas encore assez de visites.
 */

/** Pages où un interstitiel commercial serait déplacé ou nuisible. */
const BLOCKED_PREFIXES = ['/admin', '/auth', '/reglages', '/cgu', '/mentions-legales', '/politique-confidentialite', '/newsletter']

export default function PromoSplashGate() {
  const { user, profile, loading: authLoading } = useAuth()
  const pathname = usePathname()

  const [cfg, setCfg] = useState<SplashPromoConfig | null>(null)
  const [variant, setVariant] = useState<SplashPromoVariantId | null>(null)
  const [showSubscription, setShowSubscription] = useState(false)
  /** Un seul armement de minuterie par session de montage. */
  const armed = useRef(false)

  // La config est publique et non cachée : une seule lecture par chargement.
  useEffect(() => {
    let alive = true
    fetch('/api/splash-promo')
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (alive) setCfg(parseSplashPromo(j ? JSON.stringify(j) : null)) })
      .catch(() => { if (alive) setCfg(parseSplashPromo(null)) })
    return () => { alive = false }
  }, [])

  const plan = profile?.plan ?? 'basic'
  // Source de vérité de l'abonnement : le plan du profil, comme partout
  // ailleurs dans l'app (SubscriptionModal, ProBandeau, quotas promo).
  const isPayingSubscriber = plan === 'habitants' || plan === 'pro'
  const blockedPage = BLOCKED_PREFIXES.some(p => pathname?.startsWith(p))

  useEffect(() => {
    // On attend que l'auth soit résolue : sinon un abonné verrait le splash
    // pendant la fraction de seconde où son profil n'est pas encore chargé.
    if (authLoading || !cfg) return
    if (!cfg.enabled || isPayingSubscriber || blockedPage) return
    if (armed.current) return
    armed.current = true

    // Compter la visite d'abord : elle compte même si rien ne s'affiche.
    const state = countSessionOnce(readPromoSplashState(user?.created_at ?? null, cfg.activatedAt))
    if (!nextVariant(state, cfg)) return

    const timer = setTimeout(() => {
      // Re-vérification au moment de montrer : l'utilisateur a pu s'abonner,
      // ou un autre onglet a pu afficher le splash pendant l'attente.
      const fresh = readPromoSplashState(user?.created_at ?? null, cfg.activatedAt)
      const v = nextVariant(fresh, cfg)
      if (!v) return
      recordShown(fresh)
      setVariant(v)
      trackEvent('promo_splash_view', {
        variant: variantTrackName(v),
        auth: user ? 'connecte' : 'anonyme',
      })
    }, cfg.displayDelaySeconds * 1000)

    return () => clearTimeout(timer)
    // `pathname` volontairement absent : la minuterie ne doit pas redémarrer à
    // chaque navigation, sinon elle ne se déclenche jamais chez qui navigue.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, cfg, isPayingSubscriber, blockedPage])

  // Un abonnement souscrit pendant que le splash est ouvert le referme net.
  useEffect(() => {
    if (isPayingSubscriber && variant) setVariant(null)
  }, [isPayingSubscriber, variant])

  function handleClose() {
    if (variant) {
      trackEvent('promo_splash_dismiss', {
        variant: variantTrackName(variant),
        auth: user ? 'connecte' : 'anonyme',
      })
    }
    setVariant(null)
  }

  function handleDiscover() {
    if (variant) {
      trackEvent('promo_splash_click', {
        variant: variantTrackName(variant),
        auth: user ? 'connecte' : 'anonyme',
      })
    }
    setVariant(null)
    setShowSubscription(true)
  }

  return (
    <>
      {variant && (
        <SplashPromoView variant={variant} onClose={handleClose} onDiscover={handleDiscover} />
      )}
      {showSubscription && (
        // kind 'generic' ouvre la modale existante sur Habitant (recommended)
        // tout en laissant le switcher accessible vers Partenaire Local.
        <SubscriptionModal
          context={{ kind: 'generic' }}
          currentPlan={(plan as 'basic' | 'habitants' | 'pro') ?? 'basic'}
          onClose={() => setShowSubscription(false)}
        />
      )}
    </>
  )
}
