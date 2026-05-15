'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PLANS_INFO } from '@/lib/capabilities'

/**
 * Modale d'abonnement RÉUTILISABLE — La Place du Village
 *
 * Une seule modale pour tous les cas d'upgrade Stripe :
 *  - context.kind === 'claim'   : revendication d'une fiche étab → met en avant Partenaire Local (success_url = la fiche)
 *  - context.kind === 'promo'   : quota promo basic atteint (1/mois) → met en avant Habitants
 *  - context.kind === 'feature' : feature payante bloquée → choix selon le plan minimum requis
 *  - context.kind === 'generic' : upgrade simple du compte → présente les 2 plans
 *
 * 2 plans payants depuis 2026-05-15 : Habitants (4,99€) et Partenaire Local (9€).
 * Le plan minimum requis est mis en avant ("Recommandé") selon le contexte.
 */

export type SubscriptionModalContext =
  | { kind: 'claim'; etabId: string; etabNom: string }
  | { kind: 'promo'; promoTitle?: string }
  | { kind: 'feature'; featureLabel: string; minPlan?: 'habitants' | 'pro' }
  | { kind: 'generic'; title?: string; subtitle?: string }

type PayablePlan = 'habitants' | 'pro'

interface Props {
  context: SubscriptionModalContext
  onClose: () => void
}

export default function SubscriptionModal({ context, onClose }: Props) {
  const [loading, setLoading] = useState<PayablePlan | null>(null)
  const [error, setError]     = useState<string | null>(null)

  async function selectPlan(plan: PayablePlan) {
    setLoading(plan); setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) { setError('Connecte-toi pour continuer.'); setLoading(null); return }

      const body: { plan: string; etabId?: string } = { plan }
      if (context.kind === 'claim') body.etabId = context.etabId

      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.url) { window.location.href = data.url; return }
      setError(data.error ?? 'Une erreur est survenue, réessaie.')
    } catch {
      setError('Impossible de contacter le serveur.')
    }
    setLoading(null)
  }

  const { title, subtitle, recommended } = headerCopy(context)

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 2400, backgroundColor: 'rgba(15,10,5,0.6)', backdropFilter: 'blur(4px)' }}
      />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 2401,
        backgroundColor: '#FDFAF6', borderRadius: '24px 24px 0 0',
        maxHeight: '94dvh', overflowY: 'auto',
        fontFamily: 'Inter, sans-serif',
        paddingBottom: 'max(28px, env(safe-area-inset-bottom, 28px))',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
      }}>
        {/* Drag handle */}
        <div style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1CCC4', margin: '14px auto 0' }} />

        {/* Header */}
        <div style={{ padding: '18px 22px 6px', textAlign: 'center' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#8A7A6A', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 6px' }}>
            Passe à l&apos;abonnement
          </p>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: '#1A1209', margin: '0 0 6px', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            {title}
          </h2>
          <p style={{ fontSize: 13, color: '#7A6A5A', margin: 0, lineHeight: 1.5 }}>
            {subtitle}
          </p>
        </div>

        {/* Bandeau "valeur" : top features visibles dès l'arrivée */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center',
          padding: '14px 22px 4px',
        }}>
          {TOP_VALUE_CHIPS.map(chip => (
            <div key={chip} style={{
              fontSize: 11, fontWeight: 600, color: '#3C2C20',
              backgroundColor: '#F4EEE3', borderRadius: 999, padding: '5px 10px',
              border: '1px solid #E8DFD0',
            }}>
              {chip}
            </div>
          ))}
        </div>

        {/* 2 cards plan côte à côte */}
        <div style={{ display: 'flex', gap: 12, padding: '18px 16px 4px' }}>
          <PlanCard
            plan="habitants"
            loading={loading === 'habitants'}
            disabled={!!loading}
            onSelect={() => selectPlan('habitants')}
            highlighted={recommended === 'habitants'}
          />
          <PlanCard
            plan="pro"
            loading={loading === 'pro'}
            disabled={!!loading}
            onSelect={() => selectPlan('pro')}
            highlighted={recommended === 'pro'}
          />
        </div>

        {error && (
          <p style={{
            fontSize: 12, color: '#DC2626', textAlign: 'center',
            margin: '12px 22px 0', padding: '10px 14px',
            backgroundColor: '#FEF2F2', borderRadius: 12, lineHeight: 1.5,
          }}>
            {error}
          </p>
        )}

        <p style={{ fontSize: 11, color: '#9A8A7A', textAlign: 'center', margin: '14px 22px 4px', lineHeight: 1.5 }}>
          Paiement sécurisé par Stripe · Résiliable à tout moment
        </p>

        <button
          onClick={onClose}
          style={{
            display: 'block', margin: '8px auto 0',
            padding: '8px 18px', background: 'none', border: 'none',
            fontSize: 12, color: '#9A8A7A', cursor: 'pointer',
            fontFamily: 'Inter, sans-serif',
          }}
        >
          Plus tard
        </button>
      </div>
    </>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Sous-composant : 1 card plan
// ────────────────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  loading,
  disabled,
  onSelect,
  highlighted,
}: {
  plan: PayablePlan
  loading: boolean
  disabled: boolean
  onSelect: () => void
  highlighted?: boolean
}) {
  const info = PLANS_INFO[plan]

  return (
    <div style={{
      flex: 1, borderRadius: 20, padding: '18px 14px 16px',
      backgroundColor: '#fff',
      border: `2px solid ${info.color}`,
      boxShadow: highlighted ? `0 6px 24px ${info.color}33` : '0 2px 10px rgba(0,0,0,0.04)',
      display: 'flex', flexDirection: 'column', gap: 8,
      position: 'relative',
    }}>
      {highlighted && (
        <div style={{
          position: 'absolute', top: -10, right: 12,
          backgroundColor: info.color, color: '#fff',
          fontSize: 9, fontWeight: 800,
          borderRadius: 999, padding: '3px 10px',
          letterSpacing: '0.06em', textTransform: 'uppercase',
        }}>
          {info.icon} Recommandé
        </div>
      )}

      <div>
        <span style={{
          fontSize: 10, fontWeight: 800, color: info.color,
          backgroundColor: info.bgColor,
          borderRadius: 999, padding: '3px 10px',
          letterSpacing: '0.06em', textTransform: 'uppercase',
          lineHeight: 1.4,
        }}>
          {info.label}
        </span>
      </div>

      <div>
        <span style={{ fontSize: 26, fontWeight: 900, color: '#1A1209', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
          {info.priceLabel.split(' ')[0]}
        </span>
        <span style={{ fontSize: 11, color: '#8A7A6A', marginLeft: 3 }}>
          /mois
        </span>
      </div>

      <p style={{ fontSize: 11, color: '#7A6A5A', margin: '-2px 0 4px', fontStyle: 'italic' }}>
        {info.tagline}
      </p>

      <ul style={{
        margin: 0, padding: 0, listStyle: 'none',
        display: 'flex', flexDirection: 'column', gap: 5, flex: 1,
      }}>
        {info.features.map(f => (
          <li key={f} style={{
            display: 'flex', alignItems: 'flex-start', gap: 6,
            fontSize: 11.5, color: '#3C2C20', lineHeight: 1.4,
          }}>
            <span style={{ color: info.color, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>
              ✓
            </span>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={onSelect}
        disabled={disabled}
        style={{
          marginTop: 8, padding: '12px 0', borderRadius: 14, border: 'none',
          backgroundColor: loading ? '#aaa' : info.color, color: '#fff',
          fontWeight: 800, fontSize: 13,
          cursor: disabled ? 'default' : 'pointer',
          fontFamily: 'Inter, sans-serif',
          letterSpacing: '0.01em',
        }}
      >
        {loading ? '…' : `Choisir ${info.label} →`}
      </button>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Copy adaptée au contexte
// ────────────────────────────────────────────────────────────────────────────

function headerCopy(ctx: SubscriptionModalContext): {
  title: string
  subtitle: string
  recommended: PayablePlan
} {
  switch (ctx.kind) {
    case 'claim':
      return {
        title: `Gère « ${ctx.etabNom} »`,
        subtitle: 'Revendique cette fiche, édite-la, mets-toi en valeur dans le village.',
        recommended: 'pro',
      }
    case 'promo':
      return {
        title: 'Profite d\'autant de promos que tu veux',
        subtitle: ctx.promoTitle
          ? `Tu as déjà profité d'une promo ce mois-ci. Passe Habitants pour en profiter sans limite, à commencer par « ${ctx.promoTitle} ».`
          : 'Tu as déjà profité d\'une promo ce mois-ci. Passe Habitants pour en profiter sans limite.',
        recommended: 'habitants',
      }
    case 'feature':
      return {
        title: `${ctx.featureLabel} — débloque cette feature`,
        subtitle: ctx.minPlan === 'pro'
          ? 'Cette feature est réservée aux Partenaires Locaux (commerces, producteurs, artisans).'
          : 'Débloque les avantages Habitants ou passe Partenaire Local.',
        recommended: ctx.minPlan ?? 'habitants',
      }
    case 'generic':
      return {
        title: ctx.title ?? 'Débloque tout le potentiel de La Place du Village',
        subtitle: ctx.subtitle ?? 'Choisis ton offre : un peu plus de liberté, ou un statut de commerce reconnu.',
        recommended: 'habitants',
      }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Top features vendeuses, affichées en chips dès l'arrivée
// ────────────────────────────────────────────────────────────────────────────

const TOP_VALUE_CHIPS = [
  '📣 Annonces illimitées',
  '🎁 Promos sans limite',
  '⏰ Enchères 12h avant',
  '★ À la une (Partenaire)',
  '🏪 Vitrine producteur',
]
