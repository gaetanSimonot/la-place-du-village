import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-04-22.dahlia',
})

/**
 * Mapping plan interne → Stripe price ID.
 * Le plan 'basic' n'est pas payant donc absent.
 * Côté UI 'pro' = "Partenaire Local" — l'id interne reste 'pro'.
 */
export const PLAN_PRICES: Record<'habitants' | 'pro', string> = {
  habitants: process.env.STRIPE_PRICE_HABITANTS!,
  pro:       process.env.STRIPE_PRICE_PRO!,
}

/**
 * Réciproque : Stripe price ID → plan interne.
 * Utilisé par le webhook pour décider quel plan attribuer.
 */
export function planFromPriceId(priceId: string | null | undefined): 'habitants' | 'pro' | null {
  if (!priceId) return null
  if (priceId === process.env.STRIPE_PRICE_HABITANTS) return 'habitants'
  if (priceId === process.env.STRIPE_PRICE_PRO)       return 'pro'
  return null
}
