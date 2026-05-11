/**
 * CAPABILITIES — La Place du Village
 *
 * Source de vérité pour les droits liés au plan d'abonnement.
 * Modifie ce fichier (et CE FICHIER UNIQUEMENT) pour changer ce que chaque plan débloque.
 *
 * Utilisation :
 *   // Côté serveur (API route) :
 *   const ctx = await getUserContextFromRequest(req)   // server-auth.ts
 *   if (!can(ctx, 'claim_etablissement')) return 403
 *
 *   // Côté client (composant) :
 *   const { profile, isAdmin } = useAuth()
 *   const ctx = toUserContext(profile, isAdmin)
 *   if (can(ctx, 'open_shop')) { ... }
 */

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export type Plan = 'basic' | 'pro' | 'max'

/** Ordre d'affichage canonique des plans dans l'UI (basic → max) */
export const PLAN_ORDER: Plan[] = ['basic', 'pro', 'max']

export type Feature =
  | 'claim_etablissement'   // Revendiquer une fiche établissement
  | 'promo_pro'             // Promouvoir un événement en ★ Pro (bandeau + carte)
  | 'promo_max'             // Promouvoir un événement en ⚡ Max (splash plein écran)
  | 'newsletter'            // Envoyer une newsletter mensuelle aux abonnés
  | 'featured_card'         // Card mise en avant dans la liste
  | 'open_shop'             // Ouvrir une fiche dans l'annuaire Producteurs/Magasins
  | 'voice_edit'            // Édition vocale assistée par IA
  | 'detailed_stats'        // Stats détaillées (vues, intéressés…)
  | 'multi_etablissement'   // Posséder plusieurs établissements (sur demande admin)

export interface UserContext {
  /** Plan d'abonnement du user (null si pas connecté → traité comme basic) */
  plan: Plan
  /** True si l'email est dans admin_emails — override TOUS les droits */
  isAdmin: boolean
  /** True si le user est banni — bloque les writes */
  banned: boolean
}

// ──────────────────────────────────────────────────────────────────────────
// Matrice : pour chaque feature, les plans qui y ont accès
// ⚠️ C'est ICI qu'on modifie les règles métier. Une seule source de vérité.
// ──────────────────────────────────────────────────────────────────────────

const FEATURE_PLANS: Record<Feature, Plan[]> = {
  claim_etablissement: ['pro', 'max'],
  promo_pro:           ['pro', 'max'],
  promo_max:           ['max'],
  newsletter:          ['pro', 'max'],
  featured_card:       ['pro', 'max'],
  open_shop:           ['max'],
  voice_edit:          ['max'],
  detailed_stats:      ['max'],
  multi_etablissement: [],          // jamais débloqué par plan — uniquement override admin
}

// ──────────────────────────────────────────────────────────────────────────
// Helper principal : LE seul point d'évaluation des droits dans l'app
// ──────────────────────────────────────────────────────────────────────────

/**
 * Le user a-t-il accès à cette feature ?
 *
 * Règles :
 *  - Admin → toujours OUI (override total)
 *  - Banni → toujours NON
 *  - Sinon → on regarde la matrice
 */
export function can(ctx: UserContext | null, feature: Feature): boolean {
  if (!ctx) return false
  if (ctx.banned) return false
  if (ctx.isAdmin) return true
  return FEATURE_PLANS[feature].includes(ctx.plan)
}

/** OR logique sur plusieurs features */
export function canAny(ctx: UserContext | null, features: Feature[]): boolean {
  return features.some(f => can(ctx, f))
}

/** AND logique sur plusieurs features */
export function canAll(ctx: UserContext | null, features: Feature[]): boolean {
  return features.every(f => can(ctx, f))
}

/** Retourne toutes les capabilities en un objet — pratique pour passer à un composant */
export function getCapabilities(ctx: UserContext | null): Record<Feature, boolean> {
  const out = {} as Record<Feature, boolean>
  ;(Object.keys(FEATURE_PLANS) as Feature[]).forEach(f => { out[f] = can(ctx, f) })
  return out
}

// ──────────────────────────────────────────────────────────────────────────
// Métadonnées d'affichage (labels, prix indicatifs, couleurs)
// Les vrais prix viennent de Stripe (STRIPE_PRICE_PRO / STRIPE_PRICE_MAX env vars).
// Ceux-ci ne servent qu'à l'affichage marketing.
// ──────────────────────────────────────────────────────────────────────────

export const PLANS_INFO: Record<Plan, {
  label: string
  icon: string
  color: string         // couleur dominante pour badges
  bgColor: string       // fond clair pour badges
  priceLabel: string    // affichage marketing — la source de vérité Stripe est ailleurs
  tagline: string
  features: string[]    // bullet points pour l'écran d'upgrade
}> = {
  basic: {
    label:      'Basic',
    icon:       '○',
    color:      '#2D5A3D',
    bgColor:    '#E8F2EB',
    priceLabel: 'Gratuit',
    tagline:    'Pour découvrir',
    features: [
      'Consulter l\'agenda local',
      'Favoris & événements suivis',
      'Commenter, voter, suivre des profils',
      'Soumettre des événements',
    ],
  },
  pro: {
    label:      'Pro',
    icon:       '★',
    color:      '#3A5BC7',
    bgColor:    '#EEF3FF',
    priceLabel: '5 €/mois',
    tagline:    'Pour communiquer',
    features: [
      'Revendiquer ta fiche établissement',
      '1 événement ★ Pro par mois (bandeau + carte)',
      'Card mise en avant dans la liste',
      'Newsletter mensuelle à tes abonnés',
    ],
  },
  max: {
    label:      'Max',
    icon:       '✦',
    color:      '#E8622A',
    bgColor:    '#FFF0EB',
    priceLabel: '15 €/mois',
    tagline:    'Pour rayonner',
    features: [
      'Tout le plan Pro',
      'Promo ⚡ Max plein écran (splash)',
      'Fiche dans l\'annuaire Producteurs/Magasins',
      'Édition vocale assistée par IA',
      'Stats détaillées (vues, intéressés)',
    ],
  },
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers utilitaires
// ──────────────────────────────────────────────────────────────────────────

/** Construit un UserContext à partir du profile + isAdmin (côté client React) */
export function toUserContext(
  profile: { plan?: string | null; banned?: boolean | null } | null,
  isAdmin: boolean,
): UserContext {
  return {
    plan: (profile?.plan as Plan) ?? 'basic',
    isAdmin,
    banned: !!profile?.banned,
  }
}

/** Contexte par défaut pour les users non connectés */
export const ANONYMOUS_CONTEXT: UserContext = {
  plan: 'basic',
  isAdmin: false,
  banned: false,
}

/**
 * Plan minimum requis pour une feature (utile pour les messages d'upgrade).
 * Retourne null si aucun plan ne débloque la feature (= admin only).
 */
export function minPlanFor(feature: Feature): Plan | null {
  const order: Plan[] = ['basic', 'pro', 'max']
  for (const p of order) {
    if (FEATURE_PLANS[feature].includes(p)) return p
  }
  return null
}
