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
 *
 * ───────────────────────────────────────────────────────────────────────────
 * 3 plans depuis 2026-05-15 :
 *   'basic'      → Villageois (gratuit)
 *   'habitants'  → Avantages Habitants (4,99€/mois)
 *   'pro'        → Partenaire Local (9€/mois)   ← l'id interne reste 'pro'
 *                                                  pour ne rien casser Stripe + DB.
 *                                                  Le label "Partenaire Local"
 *                                                  est purement UI.
 * Le plan 'max' a été supprimé et migré en 'pro' via SQL.
 * ───────────────────────────────────────────────────────────────────────────
 */

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export type Plan = 'basic' | 'habitants' | 'pro'

/** Ordre d'affichage canonique des plans dans l'UI (basic → pro) */
export const PLAN_ORDER: Plan[] = ['basic', 'habitants', 'pro']

export type Feature =
  | 'claim_etablissement'   // Revendiquer une fiche établissement (Partenaire Local)
  | 'promo_pro'             // Créer une promotion commerce + 1 event ★ Pro/mois (Partenaire Local)
  | 'featured_card'         // Card mise en avant dans la liste (bandeau "À la une" par catégorie)
  | 'open_shop'             // Construire une fiche producteur avec produits et carte (Partenaire Local)
  | 'early_bid_access'      // Voir les enchères inversées dès leur publication (sans délai 12h)
  | 'voice_edit'            // Édition vocale assistée par IA — accessible à tous, mais quota gradué (voir rateLimit.ts)
  | 'detailed_stats'        // Stats détaillées (vues, intéressés…)
  | 'multi_etablissement'   // Posséder plusieurs établissements (sur demande admin)
  | 'publish_moment'        // Publier un « moment » (En ce moment / reel 24h)

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
  claim_etablissement: ['pro'],
  promo_pro:           ['pro'],
  featured_card:       ['pro'],
  open_shop:           ['pro'],
  detailed_stats:      ['pro'],
  early_bid_access:    ['habitants', 'pro'],
  voice_edit:          ['basic', 'habitants', 'pro'],  // accessible à tous, quota gradué côté rateLimit
  multi_etablissement: [],                              // jamais débloqué par plan — admin override only
  publish_moment:      ['habitants', 'pro'],            // + admin via override can()
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
// Les vrais prix viennent de Stripe (env vars STRIPE_PRICE_*).
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
    label:      'Villageois',
    icon:       '🏡',
    color:      '#2D5A3D',
    bgColor:    '#E8F2EB',
    priceLabel: 'Gratuit',
    tagline:    'Tout le village, déjà accessible',
    features: [
      'Consulter agenda, annuaire, promos, annonces',
      'Commenter, voter, suivre, mettre en favoris',
      'Publier des annonces (3/mois)',
      'Profiter d\'1 promo par mois',
      'Participer aux enchères (après 12h)',
    ],
  },
  habitants: {
    label:      'Avantages Habitants',
    icon:       '🌿',
    color:      '#4A8B5C',
    bgColor:    '#E3F1E7',
    priceLabel: '4,99 €/mois',
    tagline:    'Plus de liberté, plus de bons plans',
    features: [
      'Annonces illimitées (vente, troc, don, enchère)',
      'Profite d\'autant de promos que tu veux',
      'Enchères en accès anticipé (12h avant)',
      'Badge membre sur ton profil',
      'Édition vocale assistée par IA (généreuse)',
    ],
  },
  pro: {
    label:      'Partenaire Local',
    icon:       '★',
    color:      '#3A5BC7',
    bgColor:    '#EEF3FF',
    priceLabel: '9 €/mois',
    tagline:    'Pour les commerces et acteurs locaux',
    features: [
      'Revendique et édite ta fiche établissement',
      'Crée ta fiche producteur (produits + carte)',
      'À la une de ta catégorie (bandeau)',
      'Crée et gère tes promotions commerce',
      'Tous les avantages Habitants inclus',
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
  const raw = profile?.plan as string | undefined
  // Sécurité : si la valeur en base est inattendue (anciens 'max' non migrés…),
  // on retombe gracieusement en 'basic' plutôt que de planter.
  const plan: Plan = raw === 'habitants' || raw === 'pro' || raw === 'basic'
    ? raw
    : 'basic'
  return {
    plan,
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
  for (const p of PLAN_ORDER) {
    if (FEATURE_PLANS[feature].includes(p)) return p
  }
  return null
}
