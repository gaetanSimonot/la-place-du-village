'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Modale d'abonnement RÉUTILISABLE — La Place du Village
 *
 * Un seul composant pour tous les cas d'upgrade Stripe :
 *  - context.kind === 'claim'   : revendication fiche → met en avant Partenaire (success_url = fiche)
 *  - context.kind === 'promo'   : quota promo basic atteint → met en avant Habitants
 *  - context.kind === 'feature' : feature payante bloquée → contextualisé
 *  - context.kind === 'generic' : upgrade simple → présente les 3 plans
 *
 * Design : 3 cards (Villageois gratuit / Avantages Habitants / Partenaire Local) en
 * colonne sur mobile, avec hero global + footer 4 piliers. La card du plan actuel
 * du user est marquée "TU ES ICI" et son CTA est désactivé.
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
  /** Plan actuel du user pour marquer "Tu es ici". Si omis, basic par défaut. */
  currentPlan?: 'basic' | 'habitants' | 'pro'
}

// ────────────────────────────────────────────────────────────────────────────
// Couleurs et données des plans (locales — alignées sur PLANS_INFO mais avec
// les couleurs spécifiques du mockup ref/modal.png)
// ────────────────────────────────────────────────────────────────────────────

const PLAN_DATA = {
  basic: {
    id: 'basic' as const,
    label: 'Villageois',
    icon: '🏡',
    price: 'GRATUIT',
    color: '#4A8B5C',
    bgSoft: '#EEF7EF',
    bgVeryLight: '#F5FAF6',
    border: '#C8E0CE',
    tagline: 'Tout l\'essentiel pour profiter de la vie locale !',
    features: [
      'Consulter toute l\'app',
      'Voir les événements',
      'Voir les promos',
      'Voir les annonces',
      'Participer à la vie locale',
      'Utiliser les enchères (après 12h)',
      'Publier des dons illimités',
    ],
    limitsTitle: 'Avec accès limité',
    limits: [
      { label: 'Promos', value: '1 / mois' },
      { label: 'Annonces (vente/troc/enchère)', value: '3 / mois' },
    ],
    teaser: 'Déjà utile, déjà indispensable ! Passe à l\'offre Avantages pour profiter sans limites.',
  },
  habitants: {
    id: 'habitants' as const,
    label: 'Avantages Habitants',
    icon: '🌿',
    price: '4,99 €/mois',
    color: '#E8622A',
    bgSoft: '#FFF1E8',
    bgVeryLight: '#FFF8F3',
    border: '#F5C9A8',
    tagline: 'Plus de liberté, plus de bons plans, plus d\'opportunités !',
    features: [
      'Promos illimitées',
      'Annonces illimitées',
      'Enchères illimitées',
      { strong: 'Accès prioritaire aux bonnes affaires', detail: 'voir les annonces / enchères 12h avant les Villageois' },
      'Édition vocale IA généreuse (30/h)',
      'Badge membre exclusif',
      'Soutenez le développement local ❤️',
    ],
    teaserBox: {
      icon: '⭐',
      text: 'Rentabilisez votre abonnement très rapidement grâce aux bons plans et aux ventes !',
    },
    cta: 'Passer à l\'offre Avantages',
  },
  pro: {
    id: 'pro' as const,
    label: 'Partenaire Local',
    icon: '🏪',
    price: '9 €/mois',
    color: '#3A5BC7',
    bgSoft: '#EEF3FF',
    bgVeryLight: '#F5F8FF',
    border: '#C7D5F5',
    tagline: 'Développez votre activité et gagnez en visibilité locale !',
    features: [
      'Établissement revendiqué',
      'Vitrine professionnelle complète',
      'Fiche producteur (produits + carte)',
      'Mise en avant « À la une » de ta catégorie',
      'Crée et gère tes promotions commerce',
      'Tous les avantages Habitants inclus',
    ],
    teaserBox: {
      icon: '📈',
      text: 'Attirez plus de clients locaux et faites rayonner votre activité dans tout le village.',
    },
    cta: 'Devenir Partenaire Local',
  },
} as const

const PILLARS = [
  { emoji: '📍', title: '100% LOCAL',  text: 'Par et pour notre village' },
  { emoji: '🛡️', title: 'SÉCURISÉ',    text: 'Annonces vérifiées' },
  { emoji: '👥', title: 'SOLIDAIRE',   text: 'On soutient nos acteurs' },
  { emoji: '❤️', title: 'VIVANT',     text: 'Événements, échanges, entraide' },
]

// ────────────────────────────────────────────────────────────────────────────
// Composant principal
// ────────────────────────────────────────────────────────────────────────────

export default function SubscriptionModal({ context, onClose, currentPlan = 'basic' }: Props) {
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

  const { hero, sub, recommended } = headerCopy(context)

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 2400, backgroundColor: 'rgba(15,10,5,0.65)', backdropFilter: 'blur(4px)' }}
      />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 2401,
        backgroundColor: '#FBFAF7', borderRadius: '24px 24px 0 0',
        maxHeight: '94dvh', overflowY: 'auto',
        fontFamily: 'Inter, sans-serif',
        paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
      }}>
        {/* Drag handle */}
        <div style={{ width: 44, height: 4, borderRadius: 2, backgroundColor: '#D1CCC4', margin: '12px auto 0' }} />

        {/* Hero */}
        <div style={{ padding: '18px 22px 8px', textAlign: 'center' }}>
          <h2 style={{
            fontSize: 18, fontWeight: 900, color: '#2D5A3D',
            margin: '0 0 8px', letterSpacing: '-0.01em', lineHeight: 1.25,
          }}>
            {hero}
          </h2>
          <p style={{ fontSize: 13, color: '#7A6A5A', margin: 0, lineHeight: 1.5 }}>
            {sub}
          </p>
        </div>

        {/* 3 cards en colonne */}
        <div style={{ padding: '14px 16px 6px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <BasicCard isCurrent={currentPlan === 'basic'} />
          <PayableCard
            plan="habitants"
            isCurrent={currentPlan === 'habitants'}
            recommended={recommended === 'habitants'}
            loading={loading === 'habitants'}
            disabled={!!loading || currentPlan === 'habitants'}
            onSelect={() => selectPlan('habitants')}
          />
          <PayableCard
            plan="pro"
            isCurrent={currentPlan === 'pro'}
            recommended={recommended === 'pro'}
            loading={loading === 'pro'}
            disabled={!!loading || currentPlan === 'pro'}
            onSelect={() => selectPlan('pro')}
          />
        </div>

        {error && (
          <p style={{
            fontSize: 12, color: '#DC2626', textAlign: 'center',
            margin: '6px 22px 0', padding: '10px 14px',
            backgroundColor: '#FEF2F2', borderRadius: 12, lineHeight: 1.5,
          }}>
            {error}
          </p>
        )}

        {/* Footer 4 piliers */}
        <div style={{
          margin: '12px 16px 6px', padding: '14px 12px',
          backgroundColor: '#F4EEE3', borderRadius: 16,
          display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12,
        }}>
          {PILLARS.map(p => (
            <div key={p.title} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, marginBottom: 2 }}>{p.emoji}</div>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#2D5A3D', letterSpacing: '0.06em' }}>{p.title}</div>
              <div style={{ fontSize: 10, color: '#7A6A5A', lineHeight: 1.3, marginTop: 2 }}>{p.text}</div>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 10, color: '#9A8A7A', textAlign: 'center', margin: '8px 22px 0', lineHeight: 1.4 }}>
          Paiement sécurisé par Stripe · Résiliable à tout moment
        </p>

        <button
          onClick={onClose}
          style={{
            display: 'block', margin: '4px auto 0',
            padding: '10px 18px', background: 'none', border: 'none',
            fontSize: 13, color: '#9A8A7A', cursor: 'pointer',
            fontFamily: 'Inter, sans-serif', fontWeight: 600,
          }}
        >
          Plus tard
        </button>
      </div>
    </>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Card Villageois (gratuit, jamais cliquable comme upgrade)
// ────────────────────────────────────────────────────────────────────────────

function BasicCard({ isCurrent }: { isCurrent: boolean }) {
  const p = PLAN_DATA.basic
  return (
    <div style={{
      borderRadius: 18, padding: '18px 16px 16px',
      border: `2px solid ${p.border}`,
      backgroundColor: p.bgVeryLight,
      position: 'relative',
    }}>
      {isCurrent && <CurrentBadge color={p.color} />}

      <CardHeader icon={p.icon} label={p.label} price={p.price} color={p.color} priceBg={p.color} priceText="#fff" />

      <p style={{ fontSize: 12.5, color: '#3C2C20', margin: '8px 0 12px', lineHeight: 1.5, textAlign: 'center' }}>
        {p.tagline}
      </p>

      <FeatureList features={p.features} color={p.color} />

      <div style={{ height: 1, backgroundColor: p.border, margin: '12px 0' }} />

      <p style={{ fontSize: 10, fontWeight: 800, color: p.color, letterSpacing: '0.08em', textAlign: 'center', margin: '0 0 8px' }}>
        {p.limitsTitle.toUpperCase()}
      </p>
      <div style={{ backgroundColor: '#fff', borderRadius: 10, padding: '8px 12px', border: `1px solid ${p.border}` }}>
        {p.limits.map((l, i) => (
          <div key={l.label} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontSize: 12, color: '#3C2C20', padding: '4px 0',
            borderTop: i > 0 ? '1px solid #F0EBE0' : 'none',
          }}>
            <span>🎫 {l.label}</span>
            <span style={{ fontWeight: 700, color: p.color }}>{l.value}</span>
          </div>
        ))}
      </div>

      <div style={{
        marginTop: 12, padding: '10px 12px',
        backgroundColor: p.bgSoft, borderRadius: 12,
        fontSize: 11.5, color: '#3C2C20', lineHeight: 1.5,
        textAlign: 'center',
      }}>
        ❤️ {p.teaser}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Card Habitants ou Partenaire (payant)
// ────────────────────────────────────────────────────────────────────────────

function PayableCard({
  plan,
  isCurrent,
  recommended,
  loading,
  disabled,
  onSelect,
}: {
  plan: 'habitants' | 'pro'
  isCurrent: boolean
  recommended: boolean
  loading: boolean
  disabled: boolean
  onSelect: () => void
}) {
  const p = PLAN_DATA[plan]
  return (
    <div style={{
      borderRadius: 18, padding: '18px 16px 16px',
      border: `2px solid ${recommended ? p.color : p.border}`,
      backgroundColor: p.bgVeryLight,
      position: 'relative',
      boxShadow: recommended ? `0 8px 28px ${p.color}33` : '0 2px 12px rgba(0,0,0,0.04)',
    }}>
      {isCurrent && <CurrentBadge color={p.color} />}
      {recommended && !isCurrent && (
        <div style={{
          position: 'absolute', top: -11, right: 18,
          backgroundColor: p.color, color: '#fff',
          fontSize: 9, fontWeight: 800,
          borderRadius: 999, padding: '4px 11px',
          letterSpacing: '0.08em', textTransform: 'uppercase',
          boxShadow: `0 4px 14px ${p.color}55`,
        }}>
          ✦ Recommandé
        </div>
      )}

      <CardHeader icon={p.icon} label={p.label} price={p.price} color={p.color} priceBg={p.color} priceText="#fff" />

      <p style={{ fontSize: 12.5, color: '#3C2C20', margin: '8px 0 14px', lineHeight: 1.5, textAlign: 'center' }}>
        {p.tagline}
      </p>

      <FeatureList features={p.features} color={p.color} />

      {/* Encart teaser */}
      <div style={{
        marginTop: 14, padding: '10px 12px',
        backgroundColor: p.bgSoft, borderRadius: 12,
        display: 'flex', alignItems: 'flex-start', gap: 10,
      }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>{p.teaserBox.icon}</span>
        <p style={{ fontSize: 11.5, color: '#3C2C20', lineHeight: 1.5, margin: 0 }}>{p.teaserBox.text}</p>
      </div>

      {/* CTA */}
      <button
        onClick={onSelect}
        disabled={disabled}
        style={{
          marginTop: 14, width: '100%', padding: '13px',
          borderRadius: 14, border: 'none',
          backgroundColor: isCurrent ? '#D1CCC4' : (loading ? '#aaa' : p.color),
          color: '#fff', fontWeight: 800, fontSize: 13,
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
          letterSpacing: '0.02em', textTransform: 'uppercase',
          opacity: isCurrent ? 0.7 : 1,
        }}
      >
        {isCurrent ? '✓ Ton plan actuel' : loading ? '…' : p.cta}
      </button>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Sous-composants visuels
// ────────────────────────────────────────────────────────────────────────────

function CardHeader({
  icon, label, price, color, priceBg, priceText,
}: {
  icon: string; label: string; price: string;
  color: string; priceBg: string; priceText: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%',
        backgroundColor: '#fff', border: `2px solid ${color}33`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 30,
        boxShadow: `0 4px 14px ${color}22`,
      }}>
        {icon}
      </div>
      <h3 style={{
        fontSize: 18, fontWeight: 900, color, margin: 0,
        letterSpacing: '0.02em', textTransform: 'uppercase',
      }}>
        {label}
      </h3>
      <span style={{
        fontSize: 12, fontWeight: 800, color: priceText,
        backgroundColor: priceBg, borderRadius: 999, padding: '4px 14px',
        letterSpacing: '0.04em',
      }}>
        {price}
      </span>
    </div>
  )
}

function FeatureList({
  features, color,
}: {
  features: readonly (string | { strong: string; detail: string })[]
  color: string
}) {
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
      {features.map((f, i) => {
        const isObj = typeof f === 'object'
        return (
          <li key={i} style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            fontSize: 12.5, color: '#3C2C20', lineHeight: 1.45,
          }}>
            <span style={{
              flexShrink: 0, marginTop: 2,
              width: 16, height: 16, borderRadius: '50%',
              backgroundColor: color, color: '#fff',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 900,
            }}>✓</span>
            {isObj ? (
              <span>
                <strong style={{ color: '#1A1209' }}>{f.strong}</strong>
                <span style={{ display: 'block', fontSize: 11, color, fontStyle: 'italic', marginTop: 1 }}>
                  {f.detail}
                </span>
              </span>
            ) : (
              <span>{f}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function CurrentBadge({ color }: { color: string }) {
  return (
    <div style={{
      position: 'absolute', top: -11, left: 18,
      backgroundColor: '#1A1209', color: '#fff',
      fontSize: 9, fontWeight: 800,
      borderRadius: 999, padding: '4px 11px',
      letterSpacing: '0.08em', textTransform: 'uppercase',
      boxShadow: `0 4px 14px ${color}55`,
    }}>
      ✓ Ton plan actuel
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Copy adaptée au contexte
// ────────────────────────────────────────────────────────────────────────────

function headerCopy(ctx: SubscriptionModalContext): {
  hero: string
  sub: string
  recommended: PayablePlan
} {
  switch (ctx.kind) {
    case 'claim':
      return {
        hero: `Gère « ${ctx.etabNom} » dans ton village 🏪`,
        sub: 'Revendique cette fiche, mets-toi en valeur, gagne en visibilité locale.',
        recommended: 'pro',
      }
    case 'promo':
      return {
        hero: 'Profite des promos sans limite 🎁',
        sub: ctx.promoTitle
          ? `Tu as déjà profité d'une promo ce mois-ci. Passe Habitants pour en profiter sans limite, à commencer par « ${ctx.promoTitle} ».`
          : 'Tu as déjà profité d\'une promo ce mois-ci. Passe Habitants pour en profiter sans limite.',
        recommended: 'habitants',
      }
    case 'feature':
      return {
        hero: `${ctx.featureLabel}`,
        sub: ctx.minPlan === 'pro'
          ? 'Cette feature est réservée aux Partenaires Locaux (commerces, producteurs, artisans).'
          : 'Débloque tous les avantages Habitants ou passe Partenaire Local.',
        recommended: ctx.minPlan ?? 'habitants',
      }
    case 'generic':
      return {
        hero: ctx.title ?? '3 offres, 1 seul village ❤️',
        sub: ctx.subtitle ?? 'Plus vivant ensemble — choisis ton niveau d\'engagement local.',
        recommended: 'habitants',
      }
  }
}
