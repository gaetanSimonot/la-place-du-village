'use client'
import { useEffect, useRef, useState } from 'react'
import { ecranBureau } from '@/lib/bureau'
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
 * `adminTestMode` lève UNE seule règle, pour les comptes admin : l'exclusion
 * des abonnés payants. Le compte de Gaëtan est en plan `pro`, il ne pourrait
 * donc jamais voir un splash. Toutes les autres règles s'appliquent : il vit
 * la cadence exacte d'un habitant.
 *
 * Ordre des refus, du moins cher au plus cher :
 *   1. splashs désactivés en admin ;
 *   2. abonné payant (Habitant ou Partenaire), sauf admin en mode test ;
 *   3. déjà montré dans cette session ;
 *   4. cooldown / pause de fin de cycle non écoulés ;
 *   5. nouveau venu qui n'a pas encore assez de visites.
 */

/** Pages où un interstitiel commercial serait déplacé ou nuisible. */
// '/evenement' : la fiche porte déjà la demande d'activation des
// notifications. Deux interstitiels coup sur coup, c'est un de trop.
const BLOCKED_PREFIXES = ['/admin', '/auth', '/reglages', '/cgu', '/mentions-legales', '/politique-confidentialite', '/newsletter', '/evenement']

export default function PromoSplashGate() {
  const { user, profile, isAdmin, loading: authLoading } = useAuth()
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
  // Admin qui a demandé à recevoir les splashs malgré son abonnement.
  const adminSeesThem = Boolean(isAdmin && cfg?.adminTestMode)

  useEffect(() => {
    // On attend que l'auth soit résolue : sinon un abonné verrait le splash
    // pendant la fraction de seconde où son profil n'est pas encore chargé.
    if (authLoading || !cfg || blockedPage) return
    // Aucun écran d'entrée sur ordinateur : ces splashs sont conçus plein
    // écran pour un téléphone. Le réglage reste celui des habitants sur mobile.
    if (ecranBureau()) return
    if (!cfg.enabled) return
    if (isPayingSubscriber && !adminSeesThem) return
    if (armed.current) return
    armed.current = true

    const readOpts = {
      accountCreatedAt: user?.created_at ?? null,
      activatedAt: cfg.activatedAt,
      cycleEpoch: cfg.cycleEpoch,
    }

    // Compter la visite d'abord : elle compte même si rien ne s'affiche.
    const state = countSessionOnce(readPromoSplashState(readOpts))
    if (!nextVariant(state, cfg)) return

    const timer = setTimeout(() => {
      // Re-vérification au moment de montrer : l'utilisateur a pu s'abonner,
      // ou un autre onglet a pu afficher le splash pendant l'attente.
      const fresh = readPromoSplashState(readOpts)
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
  }, [authLoading, cfg, isPayingSubscriber, blockedPage, adminSeesThem])

  // Un abonnement souscrit pendant que le splash est ouvert le referme net.
  useEffect(() => {
    if (isPayingSubscriber && variant && !adminSeesThem) setVariant(null)
  }, [isPayingSubscriber, variant, adminSeesThem])

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
