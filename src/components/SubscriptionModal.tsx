'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthModal } from '@/contexts/AuthModalContext'

/**
 * Modale d'abonnement RÉUTILISABLE — La Place du Village
 *
 * Un seul plan en focus à la fois : hero gradient + switcher segmenté + détail
 * + CTA sticky. Logique Stripe et contextes inchangés.
 *  - context.kind === 'claim'   : revendication fiche → recommande Partenaire
 *  - context.kind === 'promo'   : quota promo atteint → recommande Habitant
 *  - context.kind === 'feature' : feature bloquée → recommande minPlan
 *  - context.kind === 'generic' : présentation des 3 plans
 */

export type SubscriptionModalContext =
  | { kind: 'claim'; etabId: string; etabNom: string }
  | { kind: 'promo'; promoTitle?: string }
  | { kind: 'feature'; featureLabel: string; minPlan?: 'habitants' | 'pro' }
  | { kind: 'generic'; title?: string; subtitle?: string }

type PayablePlan = 'habitants' | 'pro'
type PlanId = 'basic' | 'habitants' | 'pro'

interface Props {
  context: SubscriptionModalContext
  onClose: () => void
  /** Plan actuel du user pour marquer "Tu es ici". Si omis, basic par défaut. */
  currentPlan?: PlanId
}

// ────────────────────────────────────────────────────────────────────────────
// Données plans (textes fournis par le projet — pas d'emoji)
// ────────────────────────────────────────────────────────────────────────────

interface PerkSection { title?: string; items: readonly string[] }
interface PlanInfo {
  id: PlanId; label: string; price: string; period: string
  color: string; soft: string; veryLight: string
  tagline: string
  highlight: string
  perksLead?: string
  perks: readonly PerkSection[]
  idealFor?: string
}

const PLAN_DATA: Record<PlanId, PlanInfo> = {
  basic: {
    id: 'basic', label: 'Villageois', price: 'Gratuit', period: '',
    color: '#2D5A3D', soft: '#E8F2EB', veryLight: '#F4FAF5',
    tagline: 'Tout l’essentiel de la vie locale, gratuitement.',
    highlight: 'Toujours gratuit',
    perks: [{
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
  habitants: {
    id: 'habitants', label: 'Habitant', price: '4,99 €', period: '/mois',
    color: '#E8622A', soft: '#FFF1E8', veryLight: '#FFF8F3',
    tagline: 'Profitez pleinement de la vie locale, sans limites.',
    highlight: 'Rentabilisé dès la première utilisation',
    perksLead: 'Tout le plan Villageois, plus :',
    perks: [{
      items: [
        'Accès illimité aux promotions locales',
        'Accès anticipé aux enchères inversées dès leur publication',
        'Annonces illimitées',
        'Partagez vos moments « En ce moment » en page d’accueil (vidéo ou photo, 24h)',
        'Création d’événements accélérée grâce à l’assistance IA',
        'Publication d’articles dans l’hebdo La Place du Village',
      ],
    }],
    idealFor: 'Les habitants engagés qui publient régulièrement, profitent des bons plans locaux et souhaitent contribuer davantage à la vie du territoire.',
  },
  pro: {
    id: 'pro', label: 'Partenaire Local', price: '9 €', period: '/mois',
    color: '#3A5BC7', soft: '#EEF3FF', veryLight: '#F5F8FF',
    tagline: 'Soyez présent là où les habitants cherchent déjà.',
    highlight: 'Plus de visibilité, moins de temps à communiquer',
    perksLead: 'Tout le plan Habitant, plus :',
    perks: [
      {
        title: 'Attirez de nouveaux clients',
        items: [
          'Apparaissez dans l’annuaire local et sur la carte',
          'Présentez vos produits, services et savoir-faire',
          'Mettez en avant votre activité auprès d’une audience locale réelle',
          'Créez vos propres promotions selon vos conditions',
          'Vos offres visibles au moment où les habitants cherchent des bons plans',
        ],
      },
      {
        title: 'Toute votre communication en quelques secondes',
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
        title: 'Votre présence locale complète',
        items: [
          'Votre fiche établissement',
          'Vos produits et services',
          'Vos promotions',
          'Vos événements',
          'Vos actualités',
          'Votre agenda',
        ],
      },
    ],
    idealFor: 'Les commerçants, artisans, producteurs, associations et professionnels qui veulent gagner en visibilité locale, attirer plus de visiteurs et consacrer moins de temps à leur communication.',
  },
}

const ORDER: PlanId[] = ['basic', 'habitants', 'pro']
const SERIF = 'var(--font-display), Georgia, serif'

/** Éclaircit (amt > 0) ou assombrit (amt < 0) une couleur hex. */
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt))
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt))
  const b = Math.max(0, Math.min(255, (n & 255) + amt))
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
}

// ────────────────────────────────────────────────────────────────────────────
// Composant principal
// ────────────────────────────────────────────────────────────────────────────

export default function SubscriptionModal({ context, onClose, currentPlan = 'basic' }: Props) {
  const [loading, setLoading] = useState<PayablePlan | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const { hero, sub, recommended } = headerCopy(context)
  const [selected, setSelected] = useState<PlanId>(recommended)
  const { openAuthModal } = useAuthModal()

  async function selectPlan(plan: PayablePlan) {
    setLoading(plan); setError(null)
    try {
      // Visiteur sans compte : Stripe ne peut de toute façon pas rattacher un
      // abonnement à personne, et /api/stripe/create-checkout exige un token.
      // On l'envoie donc créer son compte plutôt que de lui annoncer une
      // session expirée qu'il n'a jamais eue. getSession() lit le stockage
      // local, sans appel réseau : c'est le bon test AVANT refreshSession().
      const { data: { session: existing } } = await supabase.auth.getSession()
      if (!existing) {
        setLoading(null)
        onClose()
        // On le ramène après connexion sur /abonnements : l'écran qu'il avait
        // sous les yeux, mais qui a une adresse. Il reclique et part sur
        // Stripe. Exception pour 'claim' : la revendication porte un etabId
        // que cette page ne connaît pas, on le renvoie donc sur la fiche pour
        // qu'il reprenne son parcours là où il l'avait laissé.
        openAuthModal(context.kind === 'claim' ? undefined : '/abonnements')
        return
      }
      // Refresh forcé : si la session a vieilli, on récupère un token frais.
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
      if (res.status === 401) setError('Session expirée. Recharge la page (F5) et réessaie.')
      else setError(data.error ?? 'Une erreur est survenue, réessaie.')
    } catch {
      setError('Impossible de contacter le serveur.')
    }
    setLoading(null)
  }

  const p             = PLAN_DATA[selected]
  const isCurrent     = selected === currentPlan
  const isRecommended = selected === recommended
  const payable       = selected !== 'basic'
  const isLoading     = loading === selected

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 2400, backgroundColor: 'rgba(15,10,5,0.65)', backdropFilter: 'blur(4px)' }} />

      <div className="pcv-sheet" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 2401,
        height: '94dvh', display: 'flex', flexDirection: 'column',
        background: '#FBFAF7', borderRadius: '24px 24px 0 0', overflow: 'hidden',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.22)', fontFamily: 'var(--font-body), sans-serif',
      }}>
        {/* ─── Hero gradient (couleur du plan sélectionné) ─── */}
        <div style={{
          position: 'relative', flexShrink: 0, color: '#fff', padding: '14px 22px 20px',
          background: `linear-gradient(135deg, ${shade(p.color, 24)} 0%, ${p.color} 60%, ${shade(p.color, -28)} 100%)`,
          transition: 'background 0.3s',
        }}>
          <HeroPattern />
          <div style={{ position: 'relative' }}>
            <div style={{ width: 44, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.4)', margin: '0 auto 16px' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', opacity: 0.85, textTransform: 'uppercase' }}>
                La Place du Village
              </div>
              <h2 style={{ margin: '8px 0 0', fontFamily: SERIF, fontSize: 24, lineHeight: 1.15, letterSpacing: '-0.01em' }}>
                {hero}
              </h2>
              <p style={{ margin: '8px auto 0', fontSize: 12.5, opacity: 0.92, lineHeight: 1.5, maxWidth: 300, fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>
                {sub}
              </p>
            </div>
          </div>
        </div>

        {/* ─── Switcher segmenté ─── */}
        <div style={{ padding: '16px 16px 0', flexShrink: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, background: '#F0EAE0', borderRadius: 14, padding: 4 }}>
            {ORDER.map(id => {
              const pl = PLAN_DATA[id]
              const active = selected === id
              return (
                <button key={id} type="button" onClick={() => setSelected(id)} style={{
                  position: 'relative', padding: '9px 4px 8px', border: 'none', cursor: 'pointer', borderRadius: 11,
                  background: active ? '#fff' : 'transparent',
                  boxShadow: active ? `0 2px 8px ${pl.color}33` : 'none',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  transition: 'all 0.18s', fontFamily: 'inherit',
                }}>
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: active ? pl.color : '#7A6A5A', letterSpacing: '-0.01em' }}>{pl.label}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: active ? '#1A1209' : '#A99B89' }}>{pl.price}</span>
                  {id === recommended && (
                    <span style={{ position: 'absolute', top: -7, right: 6, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.06em', background: pl.color, color: '#fff', padding: '2px 5px', borderRadius: 999 }}>★</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* ─── Détail du plan (scroll) ─── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 0' }}>
          <div style={{
            background: p.veryLight, borderRadius: 18, padding: '18px 16px 16px', position: 'relative',
            border: `2px solid ${isRecommended ? p.color : p.soft}`,
            boxShadow: isRecommended ? `0 8px 28px ${p.color}22` : 'none',
          }}>
            {isCurrent && (
              <div style={{ position: 'absolute', top: -11, left: 18, background: '#1A1209', color: '#fff', fontSize: 9, fontWeight: 800, borderRadius: 999, padding: '4px 11px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                ✓ Ton plan actuel
              </div>
            )}
            {isRecommended && !isCurrent && (
              <div style={{ position: 'absolute', top: -11, right: 18, background: p.color, color: '#fff', fontSize: 9, fontWeight: 800, borderRadius: 999, padding: '4px 11px', letterSpacing: '0.08em', textTransform: 'uppercase', boxShadow: `0 4px 14px ${p.color}55` }}>
                ✦ Recommandé
              </div>
            )}

            {/* Prix en grand */}
            <div style={{ textAlign: 'center', paddingTop: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: p.color, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{p.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 3, marginTop: 6 }}>
                <span style={{ fontFamily: SERIF, fontSize: 46, lineHeight: 1, color: '#1A1209', letterSpacing: '-0.02em' }}>{p.price}</span>
                {p.period && <span style={{ fontSize: 14, fontWeight: 700, color: '#7A6A5A' }}>{p.period}</span>}
              </div>
              <p style={{ margin: '8px auto 0', fontSize: 13, color: '#3C2C20', lineHeight: 1.4, maxWidth: 270, fontWeight: 600 }}>{p.tagline}</p>
            </div>

            {/* Bandeau highlight */}
            <div style={{ margin: '14px 0 0', padding: '10px 12px', background: p.soft, borderRadius: 12, display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, background: p.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <IconSpark />
              </span>
              <div style={{ fontSize: 12, fontWeight: 700, color: p.color, lineHeight: 1.35 }}>{p.highlight}</div>
            </div>

            {/* Perks */}
            <div style={{ marginTop: 16 }}>
              {p.perksLead && (
                <div style={{ fontSize: 11.5, fontWeight: 800, color: '#1A1209', marginBottom: 10 }}>{p.perksLead}</div>
              )}
              {p.perks.map((sec, si) => (
                <div key={si} style={{ marginBottom: si < p.perks.length - 1 ? 12 : 0 }}>
                  {sec.title && (
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#1A1209', margin: '0 0 8px' }}>{sec.title}</div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {sec.items.map((perk, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13, color: '#3C2C20', lineHeight: 1.4 }}>
                        <Check color={p.color} />
                        <span>{perk}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {p.idealFor && (
              <div style={{ marginTop: 14, padding: '10px 12px', background: '#fff', border: `1px solid ${p.soft}`, borderRadius: 12, fontSize: 11.5, color: '#3C2C20', lineHeight: 1.5 }}>
                <strong style={{ color: p.color }}>Idéal pour :</strong> {p.idealFor}
              </div>
            )}
          </div>

          {/* Réassurance */}
          <div style={{ margin: '14px 0 4px', padding: '12px 14px', background: '#F4EEE3', borderRadius: 14, display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
            {REASSURANCE.map(r => (
              <div key={r.t} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ flexShrink: 0, color: '#2D5A3D' }}>{r.icon}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 9.5, fontWeight: 800, color: '#2D5A3D', letterSpacing: '0.04em' }}>{r.t}</div>
                  <div style={{ fontSize: 9.5, color: '#7A6A5A', lineHeight: 1.3 }}>{r.s}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ height: 8 }} />
        </div>

        {/* ─── CTA sticky ─── */}
        <div style={{ flexShrink: 0, padding: '12px 16px', paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))', borderTop: '1px solid #EDE6DA', background: '#FBFAF7' }}>
          {/* L'erreur est collée au bouton : dans la zone qui défile, elle
              s'affichait hors champ pendant que l'utilisateur fixait le CTA. */}
          {error && (
            <p style={{ fontSize: 12, color: '#DC2626', textAlign: 'center', margin: '0 0 10px', padding: '10px 14px', backgroundColor: '#FEF2F2', borderRadius: 12, lineHeight: 1.5 }}>
              {error}
            </p>
          )}
          <button
            type="button"
            disabled={!payable || isCurrent || isLoading}
            onClick={() => payable && !isCurrent && selectPlan(selected as PayablePlan)}
            style={{
              width: '100%', padding: '15px', borderRadius: 15, border: 'none',
              background: (isCurrent || !payable) ? '#D1CCC4' : p.color, color: '#fff',
              fontSize: 15, fontWeight: 800, fontFamily: 'inherit', letterSpacing: '0.01em',
              cursor: (payable && !isCurrent && !isLoading) ? 'pointer' : 'not-allowed',
              boxShadow: (isCurrent || !payable) ? 'none' : `0 8px 24px ${p.color}55`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {isCurrent
              ? '✓ Ton plan actuel'
              : !payable
                ? 'Déjà offert à tous'
                : isLoading
                  ? '…'
                  : <>Passer {p.label} · {p.price}{p.period} <span style={{ fontSize: 17 }}>→</span></>}
          </button>
          <button type="button" onClick={onClose} style={{ display: 'block', margin: '8px auto 0', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#9A8A7A', fontFamily: 'inherit' }}>
            Plus tard
          </button>
        </div>
      </div>
    </>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Sous-composants visuels (icônes SVG — pas d'emoji)
// ────────────────────────────────────────────────────────────────────────────

function HeroPattern() {
  return (
    <svg viewBox="0 0 390 130" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.16 }}>
      <defs>
        <pattern id="smLeaf" x="0" y="0" width="56" height="56" patternUnits="userSpaceOnUse">
          <path d="M28 9 Q39 20 28 46 Q17 20 28 9z" fill="#fff" opacity="0.55" />
        </pattern>
      </defs>
      <rect width="390" height="130" fill="url(#smLeaf)" />
    </svg>
  )
}

function Check({ color }: { color: string }) {
  return (
    <span style={{ flexShrink: 0, marginTop: 1, width: 18, height: 18, borderRadius: '50%', background: color, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  )
}

/** Étincelle (remplace l'emoji du bandeau highlight). */
function IconSpark() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" />
    </svg>
  )
}

const SVG = { width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

const REASSURANCE = [
  { t: '100% LOCAL', s: 'par et pour le village', icon: (
    <svg {...SVG}><path d="M12 21s-6-5.7-6-10a6 6 0 0 1 12 0c0 4.3-6 10-6 10z" /><circle cx="12" cy="11" r="2.2" /></svg>
  ) },
  { t: 'SÉCURISÉ', s: 'paiement via Stripe', icon: (
    <svg {...SVG}><path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3z" /><polyline points="9 12 11 14 15 10" /></svg>
  ) },
  { t: 'SANS ENGAGEMENT', s: 'résiliable à tout moment', icon: (
    <svg {...SVG}><polyline points="3 4 3 9 8 9" /><path d="M4.5 14a8 8 0 1 0 1-8.3L3 9" /></svg>
  ) },
  { t: 'SOLIDAIRE', s: 'on soutient nos acteurs', icon: (
    <svg {...SVG}><path d="M12 20s-7-4.6-9-9a4.5 4.5 0 0 1 9-2 4.5 4.5 0 0 1 9 2c-2 4.4-9 9-9 9z" /></svg>
  ) },
]

// ────────────────────────────────────────────────────────────────────────────
// Copy adaptée au contexte (contextualisation conservée, sans emoji)
// ────────────────────────────────────────────────────────────────────────────

function headerCopy(ctx: SubscriptionModalContext): { hero: string; sub: string; recommended: PayablePlan } {
  switch (ctx.kind) {
    case 'claim':
      return {
        hero: `Gère « ${ctx.etabNom} »`,
        sub: 'Revendique cette fiche, mets-toi en valeur, gagne en visibilité locale.',
        recommended: 'pro',
      }
    case 'promo':
      return {
        hero: 'Les promos, sans limite',
        sub: ctx.promoTitle
          ? `Tu as déjà profité d'une promo ce mois-ci. Passe Habitant pour en profiter sans limite, à commencer par « ${ctx.promoTitle} ».`
          : "Tu as déjà profité d'une promo ce mois-ci. Passe Habitant pour en profiter sans limite.",
        recommended: 'habitants',
      }
    case 'feature':
      return {
        hero: ctx.featureLabel,
        sub: ctx.minPlan === 'pro'
          ? 'Réservé aux Partenaires Locaux — commerces, producteurs, artisans, associations.'
          : 'Débloque tous les avantages Habitant, ou passe Partenaire Local.',
        recommended: ctx.minPlan ?? 'habitants',
      }
    case 'generic':
      return {
        hero: ctx.title ?? 'Plus vivant ensemble.',
        sub: ctx.subtitle ?? "Choisis ton niveau d'engagement local — chaque abonnement fait vivre le village.",
        recommended: 'habitants',
      }
  }
}
