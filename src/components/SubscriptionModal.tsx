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

interface PlanSection { title?: string; items: readonly string[] }
interface PlanInfo {
  id: 'basic' | 'habitants' | 'pro'
  label: string; icon: string; price: string
  color: string; bgSoft: string; bgVeryLight: string; border: string
  /** Accroche courte affichée carte repliée (1-2 lignes) */
  pitch: readonly string[]
  /** Libellé du bouton (payant) */
  cta: string
  detail: { intro: string; sections: readonly PlanSection[]; idealFor: string }
}

const PLAN_DATA: Record<'basic' | 'habitants' | 'pro', PlanInfo> = {
  basic: {
    id: 'basic',
    label: 'Villageois', icon: '🏡', price: 'GRATUIT',
    color: '#4A8B5C', bgSoft: '#EEF7EF', bgVeryLight: '#F5FAF6', border: '#C8E0CE',
    pitch: ['L’essentiel pour profiter de la vie locale, gratuitement.'],
    cta: '',
    detail: {
      intro: 'Participez à la vie locale et découvrez tout ce qui se passe autour de vous.',
      sections: [{
        items: [
          'Accès complet à l’agenda local',
          '1 promotion locale utilisable chaque mois',
          'Consultation des producteurs, commerces et établissements',
          'Accès aux promotions, annonces, journal local et Place Publique',
          'Participation aux discussions et sondages',
          'Commentaires, favoris et suivi des contenus',
          'Publication sur votre mur',
          'Dépôt d’événements pour enrichir l’agenda local',
          'Jusqu’à 3 annonces par mois (vente, troc ou enchère)',
          'Dons illimités',
          'Transformez une photo d’affiche ou un message vocal en événement prêt à publier',
        ],
      }],
      idealFor: 'Les habitants qui souhaitent découvrir, suivre et participer à la vie du territoire.',
    },
  },
  habitants: {
    id: 'habitants',
    label: 'Habitant', icon: '🌿', price: '4,99 €/mois',
    color: '#E8622A', bgSoft: '#FFF1E8', bgVeryLight: '#FFF8F3', border: '#F5C9A8',
    pitch: ['💰 Rentabilisé dès les premières offres'],
    cta: 'Choisir ce plan',
    detail: {
      intro: 'Profitez pleinement de la vie locale sans limites. L’abonnement est rentabilisé dès la première utilisation.',
      sections: [{
        title: 'Tout le plan Villageois, plus :',
        items: [
          'Accès illimité aux promotions locales',
          'Accès anticipé aux enchères inversées dès leur publication',
          'Annonces illimitées',
          'Création d’événements accélérée grâce à l’assistance IA',
          'Publication d’articles dans l’hebdo La Place du Village',
        ],
      }],
      idealFor: 'Les habitants engagés qui publient régulièrement, profitent des bons plans locaux et souhaitent contribuer davantage à la vie du territoire.',
    },
  },
  pro: {
    id: 'pro',
    label: 'Partenaire Local', icon: '★', price: '9 €/mois',
    color: '#3A5BC7', bgSoft: '#EEF3FF', bgVeryLight: '#F5F8FF', border: '#C7D5F5',
    pitch: ['📈 Plus de visibilité.', '⏱️ Moins de temps passé à communiquer.'],
    cta: 'Développer mon activité',
    detail: {
      intro: 'Soyez présent là où les habitants cherchent déjà quoi faire, où sortir et où consommer local. Votre établissement apparaît directement dans leur parcours.',
      sections: [
        {
          title: '🚀 Attirez naturellement de nouveaux clients',
          items: [
            'Apparaissez dans l’annuaire local et sur la carte',
            'Présentez vos produits, services et savoir-faire',
            'Mettez en avant votre activité auprès d’une audience locale réelle',
            'Créez vos propres promotions selon vos conditions',
            'Vos offres visibles au moment où les habitants cherchent des bons plans',
          ],
        },
        {
          title: '📣 Toute votre communication en quelques secondes',
          items: [
            'Création automatique d’affiches professionnelles',
            'Génération de bannières et visuels promotionnels',
            'Publications Facebook prêtes à partager',
            'Publications Instagram prêtes à publier',
            'Textes promotionnels générés automatiquement',
            'Diffusion immédiate de vos événements sur l’agenda et la carte',
          ],
        },
        {
          title: '📍 Votre présence locale complète',
          items: [
            'Votre fiche établissement',
            'Vos produits et services',
            'Vos promotions',
            'Vos événements',
            'Vos actualités',
            'Votre agenda',
          ],
        },
        {
          title: '💰 Un investissement vite rentabilisé',
          items: [
            'Pour moins de 10 €/mois : une visibilité permanente auprès des habitants + des outils de communication qui vous font gagner un temps précieux',
          ],
        },
      ],
      idealFor: 'Les commerçants, artisans, producteurs, associations et professionnels qui veulent gagner en visibilité locale, attirer plus de visiteurs et consacrer moins de temps à leur communication.',
    },
  },
}

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
      // Refresh forcé : si la session a vieilli (ex: après plusieurs heures
      // sur la page, ou après que l'admin a touché le profile), on récupère
      // un access_token frais avant de partir vers l'API.
      await supabase.auth.refreshSession()
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        setError('Ta session a expiré. Reconnecte-toi pour continuer.')
        setLoading(null)
        return
      }

      const body: { plan: string; etabId?: string } = { plan }
      if (context.kind === 'claim') body.etabId = context.etabId

      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.url) { window.location.href = data.url; return }
      if (res.status === 401) {
        setError('Session expirée. Recharge la page (F5) et réessaie.')
      } else {
        setError(data.error ?? 'Une erreur est survenue, réessaie.')
      }
    } catch {
      setError('Impossible de contacter le serveur.')
    }
    setLoading(null)
  }

  const { hero, sub, recommended } = headerCopy(context)

  // Cartes repliées par défaut ; le plan recommandé est déplié d'emblée.
  const [expanded, setExpanded] = useState<Record<'basic' | 'habitants' | 'pro', boolean>>(
    () => ({ basic: false, habitants: false, pro: false, [recommended]: true }),
  )
  const toggle = (k: 'basic' | 'habitants' | 'pro') => setExpanded(e => ({ ...e, [k]: !e[k] }))

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

        {/* 3 cards en colonne (repliables) */}
        <div style={{ padding: '14px 16px 6px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <PlanCard
            plan="basic" payable={false}
            isCurrent={currentPlan === 'basic'} recommended={false}
            expanded={expanded.basic} onToggle={() => toggle('basic')}
            loading={false} disabled onSelect={() => {}}
          />
          <PlanCard
            plan="habitants" payable
            isCurrent={currentPlan === 'habitants'} recommended={recommended === 'habitants'}
            expanded={expanded.habitants} onToggle={() => toggle('habitants')}
            loading={loading === 'habitants'} disabled={!!loading || currentPlan === 'habitants'}
            onSelect={() => selectPlan('habitants')}
          />
          <PlanCard
            plan="pro" payable
            isCurrent={currentPlan === 'pro'} recommended={recommended === 'pro'}
            expanded={expanded.pro} onToggle={() => toggle('pro')}
            loading={loading === 'pro'} disabled={!!loading || currentPlan === 'pro'}
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

function PlanCard({ plan, payable, isCurrent, recommended, expanded, onToggle, loading, disabled, onSelect }: {
  plan: 'basic' | 'habitants' | 'pro'
  payable: boolean
  isCurrent: boolean
  recommended: boolean
  expanded: boolean
  onToggle: () => void
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
          backgroundColor: p.color, color: '#fff', fontSize: 9, fontWeight: 800,
          borderRadius: 999, padding: '4px 11px', letterSpacing: '0.08em',
          textTransform: 'uppercase', boxShadow: `0 4px 14px ${p.color}55`,
        }}>
          ✦ Recommandé
        </div>
      )}

      <CardHeader icon={p.icon} label={p.label} price={p.price} color={p.color} priceBg={p.color} priceText="#fff" />

      {/* Accroche courte */}
      <div style={{ margin: '10px 0 14px', textAlign: 'center' }}>
        {p.pitch.map((line, i) => (
          <p key={i} style={{ margin: i ? '2px 0 0' : 0, fontSize: 13, fontWeight: 700, color: '#3C2C20', lineHeight: 1.4 }}>{line}</p>
        ))}
      </div>

      {/* CTA (payant) ou état (gratuit) */}
      {payable ? (
        <button onClick={onSelect} disabled={disabled} style={{
          width: '100%', padding: '13px', borderRadius: 14, border: 'none',
          backgroundColor: isCurrent ? '#D1CCC4' : (loading ? '#aaa' : p.color),
          color: '#fff', fontWeight: 800, fontSize: 13,
          cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
          letterSpacing: '0.02em', textTransform: 'uppercase', opacity: isCurrent ? 0.7 : 1,
        }}>
          {isCurrent ? '✓ Ton plan actuel' : loading ? '…' : p.cta}
        </button>
      ) : (
        <div style={{ textAlign: 'center', padding: '11px', borderRadius: 14, backgroundColor: '#fff', border: `1.5px solid ${p.border}`, fontSize: 12.5, fontWeight: 800, color: p.color, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
          {isCurrent ? '✓ Ton plan actuel' : 'Offert à tous'}
        </div>
      )}

      {/* Voir les avantages */}
      <button onClick={onToggle} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        width: '100%', marginTop: 10, padding: '8px', background: 'none', border: 'none',
        cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, color: p.color,
      }}>
        {expanded ? '▲ Masquer les avantages' : '▼ Voir les avantages'}
      </button>

      {expanded && <PlanDetail detail={p.detail} color={p.color} border={p.border} bgSoft={p.bgSoft} />}
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

function PlanDetail({ detail, color, border, bgSoft }: {
  detail: PlanInfo['detail']; color: string; border: string; bgSoft: string
}) {
  return (
    <div style={{ marginTop: 12, borderTop: `1px solid ${border}`, paddingTop: 12 }}>
      <p style={{ fontSize: 12, color: '#5A4A3A', lineHeight: 1.5, margin: '0 0 12px' }}>{detail.intro}</p>
      {detail.sections.map((s, i) => (
        <div key={i} style={{ marginBottom: 12 }}>
          {s.title && <p style={{ fontSize: 12.5, fontWeight: 800, color: '#1A1209', margin: '0 0 7px' }}>{s.title}</p>}
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
            {s.items.map((it, j) => (
              <li key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: '#3C2C20', lineHeight: 1.45 }}>
                <span style={{
                  flexShrink: 0, marginTop: 2, width: 16, height: 16, borderRadius: '50%',
                  backgroundColor: color, color: '#fff', display: 'inline-flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900,
                }}>✓</span>
                <span>{it}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div style={{ marginTop: 4, padding: '10px 12px', backgroundColor: bgSoft, borderRadius: 12, fontSize: 11.5, color: '#3C2C20', lineHeight: 1.5 }}>
        <strong style={{ color }}>Idéal pour :</strong> {detail.idealFor}
      </div>
    </div>
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
