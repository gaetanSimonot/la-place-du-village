/**
 * Système de visibilité / mise en avant.
 * Voir scripts/2026-05-17_featured_system.sql.
 */

export type FeaturedSlot = 'splash' | 'hub_hero' | 'a_la_une' | 'homepage'

export type FeaturedContentType = 'evenement' | 'etablissement' | 'producteur' | 'annonce' | 'promotion' | 'forum_topic'

export type FeaturedSource = 'admin' | 'pro_credit' | 'boost_purchase' | 'editorial'

export interface FeaturedSlotRow {
  id: string
  slot: FeaturedSlot
  content_type: FeaturedContentType
  content_id: string
  starts_at: string
  ends_at: string
  priority: number
  sponsored: boolean
  source: FeaturedSource
  created_by: string | null
  created_by_admin: boolean
  created_at: string
  image_position: string | null
  /**
   * Position fixe 1, 2 ou 3 — utilisée UNIQUEMENT pour homepage+evenement.
   * 1 = grosse tuile, 2 et 3 = mini tuiles. NULL pour les autres cas
   * (homepage+annonce/promo, splash, hub_hero) qui gardent priority libre.
   */
  position: number | null
}

/**
 * Retourne l'ISO du prochain minuit Europe/Paris.
 * Utilisé pour `ends_at` quand on feature un event en homepage : le slot
 * expire automatiquement au passage du jour, demain = fallback auto reprend.
 */
export function endOfTodayParisISO(): string {
  // 1. Aujourd'hui en local Paris (YYYY-MM-DD)
  const todayParis = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  const [y, m, d] = todayParis.split('-').map(Number)

  // 2. Construit "demain 00:00 Paris" en partant de "demain 00:00 UTC" puis
  //    en ajustant via l'offset Paris/UTC du moment (varie selon DST).
  let candidate = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0))
  const parisH = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Paris', hour: '2-digit', hour12: false,
    }).format(candidate),
  )
  // parisH = heure Paris à candidate-UTC. Si elle vaut H, candidate est en
  // avance de H heures sur le minuit Paris cherché → on recule.
  if (parisH > 0) {
    candidate = new Date(candidate.getTime() - parisH * 3600 * 1000)
  }
  return candidate.toISOString()
}

/**
 * Slots affichés dans l'UI admin/utilisateur.
 * `a_la_une` reste valide en DB (CHECK constraint) mais n'est plus managé ici :
 * chaque catégorie a son propre bandeau "À la une" géré dans ses pages liste.
 */
export const FEATURED_SLOTS: { id: FeaturedSlot; label: string; description: string; emoji: string }[] = [
  { id: 'splash',    label: 'Splash screen',    emoji: '✨', description: 'Écran d\'accueil avant l\'app (visibilité maximale)' },
  { id: 'hub_hero',  label: 'Carousel hub',     emoji: '🌟', description: 'Grosse card en haut de l\'accueil (events, établissements, sujets)' },
  { id: 'homepage',  label: 'Tuiles homepage',  emoji: '📢', description: 'Injection dans les tuiles de l\'accueil (events, promos, annonces)' },
]

/** Types autorisés par slot. Le modal de placement filtre ce qui est proposé. */
export const SLOT_ALLOWED_TYPES: Record<FeaturedSlot, FeaturedContentType[]> = {
  splash:    ['evenement', 'promotion', 'annonce', 'etablissement', 'producteur'],
  hub_hero:  ['evenement', 'etablissement', 'producteur', 'forum_topic'],
  a_la_une:  [],  // déprécié — géré par les bandeaux de catégorie
  // homepage : les events featured remplacent la sélection auto "Aujourd'hui"
  // (cf. /api/hub). Si aucun event featured → fallback events du jour comme avant.
  homepage:  ['evenement', 'promotion', 'annonce'],
}

/** Inversion : pour un content_type donné, quels slots sont disponibles ? */
export function allowedSlotsForContent(contentType: FeaturedContentType): FeaturedSlot[] {
  return FEATURED_SLOTS
    .map(s => s.id)
    .filter(s => SLOT_ALLOWED_TYPES[s].includes(contentType))
}

export interface FeatureCredits {
  user_id: string
  period_start: string
  period_end: string
  slots_total: number
  slots_used: number
  updated_at: string
}

export function creditsRemaining(c: FeatureCredits | null): number {
  if (!c) return 0
  return Math.max(0, c.slots_total - c.slots_used)
}
