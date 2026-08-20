/**
 * Réglages des splashs promotionnels de l'offre Habitant.
 *
 * ⚠️ À ne pas confondre avec le « splash éditorial » (l'écran d'entrée façon
 * magazine), qui vit dans config('splash_hero_image_url') / ('splash_decouvrir').
 * Ici il s'agit de l'interstitiel qui met en avant l'abonnement.
 *
 * Stocké en JSON dans config('splash_promo'), comme config('promo_carousel').
 * Source de vérité unique : l'API, l'admin et le front importent tous ce
 * fichier, pour qu'un défaut ou une borne ne soit jamais défini deux fois.
 */

export const SPLASH_PROMO_KEY = 'splash_promo'

/**
 * Les variantes, dans leur ordre de rotation.
 * `track` est le nom envoyé aux analytics (imposé par la spec produit),
 * distinct de l'id technique qui suit le nommage des maquettes.
 * Ajouter une 4e variante = une ligne ici + un cas dans SPLASH_PROMO_CONTENT.
 */
export const SPLASH_PROMO_VARIANTS = [
  { id: 'decouverte', label: 'Découverte', track: 'general' },
  { id: 'economies',  label: 'Économies',  track: 'promotions' },
  { id: 'soutien',    label: 'Soutien',    track: 'support' },
] as const

export type SplashPromoVariantId = typeof SPLASH_PROMO_VARIANTS[number]['id']

/** Nom analytics d'une variante (`general` | `promotions` | `support`). */
export function variantTrackName(id: SplashPromoVariantId): string {
  return SPLASH_PROMO_VARIANTS.find(v => v.id === id)?.track ?? id
}

export interface SplashPromoConfig {
  /** Interrupteur général. À false, aucun splash promo ne doit être affiché. */
  enabled: boolean
  /** Nombre de visites avant le tout premier splash (0 = dès la 1re visite). */
  firstDisplayAfterVisits: number
  /** Jours d'attente après qu'un splash a été affiché puis fermé ou ignoré. */
  cooldownDays: number
  /** Jours d'attente une fois les 3 variantes présentées. */
  cycleResetDays: number
  /** Secondes après l'arrivée sur l'app avant de faire surgir le splash. */
  displayDelaySeconds: number
  /**
   * Date ISO de la toute première activation du système (première bascule
   * off → on), posée automatiquement par l'API et jamais remise à zéro.
   *
   * C'est elle qui sépare les vétérans des nouveaux venus : un compte créé
   * avant cette date n'a pas à attendre trois nouvelles visites. Elle est
   * volontairement en base et non en dur dans le code, pour que la frontière
   * reste juste quelle que soit la date à laquelle on décide d'activer.
   */
  activatedAt: string | null
  /**
   * Mode test réservé aux comptes ADMIN : le splash s'affiche à chaque visite,
   * en tournant sur les trois variantes, même si les splashs sont globalement
   * désactivés. Sert à vérifier le comportement réel sur son propre téléphone
   * avant d'ouvrir aux habitants.
   *
   * Sans effet sur un compte non-admin : quelqu'un qui n'est pas admin ne verra
   * jamais rien à cause de ce réglage.
   */
  adminTestMode: boolean
}

/**
 * Défauts. `enabled: false` est volontaire : rien ne doit s'afficher tant que
 * l'admin ne l'a pas activé explicitement depuis Carrousel Hub.
 */
export const SPLASH_PROMO_DEFAULTS: SplashPromoConfig = {
  enabled: false,
  firstDisplayAfterVisits: 3,
  cooldownDays: 14,
  cycleResetDays: 30,
  displayDelaySeconds: 6,
  activatedAt: null,
  adminTestMode: false,
}

/** Bornes de saisie, partagées par l'admin (inputs) et l'API (validation). */
export const SPLASH_PROMO_BOUNDS = {
  firstDisplayAfterVisits: { min: 0, max: 100 },
  cooldownDays:            { min: 0, max: 365 },
  cycleResetDays:          { min: 0, max: 365 },
  displayDelaySeconds:     { min: 0, max: 120 },
} as const

/** Date ISO valide, ou null. Refuse tout ce qui n'est pas une vraie date. */
function cleanIsoDate(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null
  const t = Date.parse(raw)
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}

/** Entier borné, avec repli sur le défaut si la valeur est inexploitable. */
function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

/**
 * Normalise n'importe quelle entrée (JSON de la base, corps d'une requête)
 * en une config complète et valide. Toute clé absente ou aberrante retombe
 * sur son défaut : une config à moitié écrite ne peut pas casser l'appelant.
 */
export function normalizeSplashPromo(input: unknown): SplashPromoConfig {
  const o = (input && typeof input === 'object') ? input as Record<string, unknown> : {}
  const b = SPLASH_PROMO_BOUNDS
  return {
    enabled: typeof o.enabled === 'boolean' ? o.enabled : SPLASH_PROMO_DEFAULTS.enabled,
    firstDisplayAfterVisits: clampInt(o.firstDisplayAfterVisits, b.firstDisplayAfterVisits.min, b.firstDisplayAfterVisits.max, SPLASH_PROMO_DEFAULTS.firstDisplayAfterVisits),
    cooldownDays:            clampInt(o.cooldownDays,            b.cooldownDays.min,            b.cooldownDays.max,            SPLASH_PROMO_DEFAULTS.cooldownDays),
    cycleResetDays:          clampInt(o.cycleResetDays,          b.cycleResetDays.min,          b.cycleResetDays.max,          SPLASH_PROMO_DEFAULTS.cycleResetDays),
    displayDelaySeconds:     clampInt(o.displayDelaySeconds,     b.displayDelaySeconds.min,     b.displayDelaySeconds.max,     SPLASH_PROMO_DEFAULTS.displayDelaySeconds),
    activatedAt: cleanIsoDate(o.activatedAt),
    adminTestMode: typeof o.adminTestMode === 'boolean' ? o.adminTestMode : SPLASH_PROMO_DEFAULTS.adminTestMode,
  }
}

/** Parse la colonne `value` de config('splash_promo'). Jamais d'exception. */
export function parseSplashPromo(value: string | null | undefined): SplashPromoConfig {
  if (!value) return { ...SPLASH_PROMO_DEFAULTS }
  try { return normalizeSplashPromo(JSON.parse(value)) }
  catch { return { ...SPLASH_PROMO_DEFAULTS } }
}
