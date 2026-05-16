/**
 * Catalogue boost — achats Stripe one-shot.
 *
 * Stripe est appelé en `mode: 'payment'` avec price_data inline
 * (pas besoin de créer des produits dans le dashboard Stripe).
 */

import type { FeaturedSlot } from '@/lib/featured'

export interface BoostOffer {
  key: string
  label: string
  description: string
  emoji: string
  slot: FeaturedSlot
  duration_hours: number
  price_cents: number
}

export const BOOST_OFFERS: BoostOffer[] = [
  {
    key:           'homepage_24h',
    label:         '24h homepage',
    description:   'Votre contenu en avant dans les tuiles de la page d\'accueil pendant 24h',
    emoji:         '📢',
    slot:          'homepage',
    duration_hours: 24,
    price_cents:    400,
  },
  {
    key:           'hub_3days',
    label:         '3 jours hub',
    description:   'Votre contenu dans le grand carousel du hub pendant 3 jours',
    emoji:         '🌟',
    slot:          'hub_hero',
    duration_hours: 72,
    price_cents:    900,
  },
  {
    key:           'splash_24h',
    label:         'Splash screen',
    description:   'Plein écran d\'accueil pendant 24h (visibilité maximale)',
    emoji:         '✨',
    slot:          'splash',
    duration_hours: 24,
    price_cents:    1900,
  },
  // Notification locale 12€ : à implémenter séparément (pas un featured_slot mais un push)
]

export function findOffer(key: string): BoostOffer | undefined {
  return BOOST_OFFERS.find(o => o.key === key)
}

export function priceLabel(cents: number): string {
  const eur = cents / 100
  return eur % 1 === 0 ? `${eur}€` : `${eur.toFixed(2)}€`
}
