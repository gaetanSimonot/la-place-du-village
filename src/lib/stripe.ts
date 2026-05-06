import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-04-22.dahlia',
})

export const PLAN_PRICES: Record<'pro' | 'max', string> = {
  pro: process.env.STRIPE_PRICE_PRO!,
  max: process.env.STRIPE_PRICE_MAX!,
}
