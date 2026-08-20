import {
  SPLASH_PROMO_VARIANTS,
  type SplashPromoConfig,
  type SplashPromoVariantId,
} from './splashPromo'

/**
 * État de rotation des splashs promo, côté navigateur.
 *
 * Stocké en localStorage sous `pdv-promo-splash` (convention `pdv-*` du projet).
 * Volontairement PAS en base : ça doit marcher pour les visiteurs sans compte,
 * et on ne va pas créer une table pour trois dates. Conséquence assumée : un
 * même habitant sur deux appareils suit deux rotations indépendantes.
 */

const KEY = 'pdv-promo-splash'
/** Marqueur de session (onglet) : empêche de recompter les refresh. */
const SESSION_KEY = 'pdv-promo-splash-session'

/**
 * Traces laissées par une utilisation antérieure de l'app. Si l'une d'elles
 * existe déjà au moment où on crée l'état, c'est un navigateur qui connaît
 * déjà La Place du Village.
 */
const PRIOR_USE_KEYS = [
  'pdv-welcome-shown', 'pdv-zone-user', 'pdv-carte-depart',
  'pdv-theme-color', 'pdv-splash-hero', 'pdv-plans-card-dismissed',
]

export interface PromoSplashState {
  v: 1
  /** Sessions éligibles comptées depuis la découverte de l'app. */
  sessions: number
  /** Index de la PROCHAINE variante à montrer (0..n-1). */
  nextIndex: number
  /** Dernier affichage effectif (ISO). Ancre du cooldown. */
  lastShownAt: string | null
  /** Fin du cycle des 3 variantes (ISO). Ancre de la pause longue. */
  cycleDoneAt: string | null
  /** Navigateur déjà utilisateur avant l'activation → pas d'attente initiale. */
  veteran: boolean
}

function emptyState(veteran: boolean): PromoSplashState {
  return { v: 1, sessions: 0, nextIndex: 0, lastShownAt: null, cycleDoneAt: null, veteran }
}

function hasPriorUse(): boolean {
  try { return PRIOR_USE_KEYS.some(k => localStorage.getItem(k) !== null) }
  catch { return false }
}

/**
 * Lit l'état, en le créant au premier passage.
 *
 * `accountCreatedAt` vient de l'utilisateur Supabase quand il est connecté, et
 * `activatedAt` de la config admin : un compte créé AVANT la première
 * activation du système est un vétéran, même sur un navigateur tout neuf. La
 * frontière suit donc la date réelle de lancement, pas une date écrite en dur.
 */
export function readPromoSplashState(
  accountCreatedAt?: string | null,
  activatedAt?: string | null,
): PromoSplashState {
  if (typeof window === 'undefined') return emptyState(false)
  let state: PromoSplashState
  try {
    const raw = localStorage.getItem(KEY)
    state = raw ? { ...emptyState(false), ...JSON.parse(raw) } : emptyState(hasPriorUse())
  } catch {
    state = emptyState(hasPriorUse())
  }
  // Un compte créé avant l'activation suffit à faire un vétéran, même si le
  // navigateur est vierge (nouveau téléphone, mode privé, cache effacé).
  if (!state.veteran && accountCreatedAt && activatedAt
      && Date.parse(accountCreatedAt) < Date.parse(activatedAt)) {
    state = { ...state, veteran: true }
    writePromoSplashState(state)
  }
  return state
}

export function writePromoSplashState(state: PromoSplashState): void {
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* quota, mode privé */ }
}

/**
 * Compte la session en cours, une seule fois par onglet. Un refresh ou une
 * navigation interne ne recompte pas : sessionStorage survit au refresh et
 * meurt à la fermeture de l'onglet, ce qui est exactement la granularité
 * « vraie visite » qu'on cherche.
 */
export function countSessionOnce(state: PromoSplashState): PromoSplashState {
  try {
    if (sessionStorage.getItem(SESSION_KEY)) return state
    sessionStorage.setItem(SESSION_KEY, '1')
  } catch {
    return state // pas de sessionStorage → on préfère ne pas compter que sur-compter
  }
  const next = { ...state, sessions: state.sessions + 1 }
  writePromoSplashState(next)
  return next
}

/** Le splash a-t-il déjà été montré dans cette session/onglet ? */
export function shownThisSession(): boolean {
  try { return sessionStorage.getItem(SESSION_KEY) === 'shown' } catch { return false }
}
function markShownThisSession(): void {
  try { sessionStorage.setItem(SESSION_KEY, 'shown') } catch { /* noop */ }
}

function addDays(iso: string, days: number): number {
  return new Date(iso).getTime() + days * 86_400_000
}

/** Rotation du mode test admin, séparée pour ne jamais polluer l'état réel. */
const TEST_KEY = 'pdv-promo-splash-test'

/**
 * Variante suivante en mode test admin : tourne sur les trois à chaque
 * affichage, sans toucher `pdv-promo-splash`. On peut donc tester autant qu'on
 * veut sans consommer le cycle qu'on verra ensuite en conditions réelles.
 */
export function nextTestVariant(): SplashPromoVariantId {
  let i = 0
  try {
    i = Number(localStorage.getItem(TEST_KEY)) || 0
    localStorage.setItem(TEST_KEY, String((i + 1) % SPLASH_PROMO_VARIANTS.length))
  } catch { /* mode privé : on reste sur la première */ }
  return SPLASH_PROMO_VARIANTS[i % SPLASH_PROMO_VARIANTS.length].id
}

/**
 * Quelle variante afficher maintenant, ou `null` si aucune.
 *
 * L'appelant a déjà écarté : splashs désactivés, abonné payant, et l'a appelée
 * après avoir compté la session. Ici on ne juge que la rotation et les délais.
 */
export function nextVariant(
  state: PromoSplashState,
  cfg: SplashPromoConfig,
  now: number = Date.now(),
): SplashPromoVariantId | null {
  if (shownThisSession()) return null

  // Pause de fin de cycle : les 3 variantes ont été vues.
  if (state.cycleDoneAt) {
    if (now < addDays(state.cycleDoneAt, cfg.cycleResetDays)) return null
    // La pause est écoulée : le cycle peut repartir (l'écriture se fera à
    // l'affichage, pour ne rien persister si finalement rien ne s'affiche).
  } else if (state.lastShownAt && now < addDays(state.lastShownAt, cfg.cooldownDays)) {
    // Cooldown entre deux variantes.
    return null
  }

  // Nouveau venu : il doit avoir accumulé assez de visites. Le vétéran, non.
  if (!state.veteran && state.sessions < cfg.firstDisplayAfterVisits) return null

  const index = state.cycleDoneAt ? 0 : state.nextIndex
  return SPLASH_PROMO_VARIANTS[index]?.id ?? SPLASH_PROMO_VARIANTS[0].id
}

/**
 * À appeler au moment où le splash devient visible — pas à sa fermeture.
 *
 * Ancrer le cooldown sur l'AFFICHAGE et non sur le dismiss garantit qu'un
 * rechargement de page ne le refait pas surgir, même si l'utilisateur ne
 * clique sur rien (fermeture d'onglet, crash, navigation arrière).
 */
export function recordShown(state: PromoSplashState, nowIso: string = new Date().toISOString()): PromoSplashState {
  const wasLast = state.nextIndex >= SPLASH_PROMO_VARIANTS.length - 1
  const restarting = state.cycleDoneAt !== null
  const next: PromoSplashState = {
    ...state,
    lastShownAt: nowIso,
    // Cycle qui repart : on repasse de la variante 0 à la 1.
    nextIndex: restarting ? 1 : (wasLast ? 0 : state.nextIndex + 1),
    cycleDoneAt: restarting ? null : (wasLast ? nowIso : null),
  }
  writePromoSplashState(next)
  markShownThisSession()
  return next
}
