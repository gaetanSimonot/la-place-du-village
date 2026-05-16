/**
 * Système de visibilité / mise en avant.
 * Voir scripts/2026-05-17_featured_system.sql.
 */

export type FeaturedSlot = 'splash' | 'hub_hero' | 'a_la_une' | 'homepage'

export type FeaturedContentType = 'evenement' | 'etablissement' | 'producteur' | 'annonce' | 'promotion'

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
}

export const FEATURED_SLOTS: { id: FeaturedSlot; label: string; description: string; emoji: string }[] = [
  { id: 'splash',    label: 'Splash screen',    emoji: '✨', description: 'Écran d\'accueil avant l\'app (priorité absolue)' },
  { id: 'hub_hero',  label: 'Carousel hub',     emoji: '🌟', description: 'Grosse card en haut de l\'accueil (events + établissements)' },
  { id: 'a_la_une',  label: 'À la une',          emoji: '⭐', description: 'Carousel "À la une" — pros et commerces' },
  { id: 'homepage',  label: 'Tuiles homepage',  emoji: '📢', description: 'Injection dans les tuiles de l\'accueil (promos & annonces)' },
]

/** Types autorisés par slot. Le modal de placement filtre ce qui est proposé. */
export const SLOT_ALLOWED_TYPES: Record<FeaturedSlot, FeaturedContentType[]> = {
  splash:    ['evenement', 'promotion', 'annonce', 'etablissement'],
  hub_hero:  ['evenement', 'etablissement'],
  a_la_une:  ['etablissement', 'producteur'],
  homepage:  ['promotion', 'annonce'],
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
