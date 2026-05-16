'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { FEATURED_SLOTS, SLOT_ALLOWED_TYPES, type FeaturedSlot, type FeaturedContentType, type FeatureCredits, creditsRemaining } from '@/lib/featured'
import { BOOST_OFFERS, priceLabel } from '@/lib/boost'

interface Props {
  contentType: FeaturedContentType
  contentId:   string
  /** Pour la modal — permet d'identifier owner vs autre. Optionnel. */
  ownerUserId?: string | null
}

/**
 * Bouton admin "⭐ Mettre en avant" — visible uniquement pour les admins,
 * destiné à être posé inline (par exemple à côté du bouton "Éditer" dans
 * le header sticky d'une fiche). Le parent contrôle son placement.
 *
 * Pour les pros / users : passer par /profil/visibilite (lui aussi monté
 * sur FeatureModal exporté).
 */
export default function FeatureButton({ contentType, contentId, ownerUserId }: Props) {
  const { user, profile, isAdmin } = useAuth()
  const [open, setOpen] = useState(false)

  if (!user || !isAdmin) return null

  const isOwner = !!ownerUserId && ownerUserId === user.id

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Mettre en avant (admin)"
        title="Mettre en avant (admin)"
        style={{
          padding: '5px 11px', borderRadius: 10,
          border: '1.5px solid #E8A627', backgroundColor: '#FFF8E8',
          color: '#B07E1F',
          fontFamily: 'Inter, sans-serif',
          fontSize: 11, fontWeight: 800,
          cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 4,
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
      >
        ⭐ Avant
      </button>

      {open && (
        <FeatureModal
          contentType={contentType}
          contentId={contentId}
          isAdmin={true}
          isOwner={isOwner}
          plan={(profile?.plan as 'basic' | 'habitants' | 'pro' | undefined) ?? 'basic'}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

interface ModalProps {
  contentType: FeaturedContentType
  contentId:   string
  isAdmin:     boolean
  isOwner:     boolean
  plan:        'basic' | 'habitants' | 'pro'
  onClose:     () => void
}

export function FeatureModal({ contentType, contentId, isAdmin, isOwner, plan, onClose }: ModalProps) {
  const allowedSlots = FEATURED_SLOTS.filter(s => SLOT_ALLOWED_TYPES[s.id].includes(contentType))

  const [credits, setCredits]             = useState<FeatureCredits | null>(null)
  const [creditsLoaded, setCreditsLoaded] = useState(false)
  const [submitting, setSubmitting]       = useState(false)
  const [error, setError]                 = useState<string | null>(null)

  // Charge le crédit dispo (utile pour pro)
  useEffect(() => {
    if (!isOwner) { setCreditsLoaded(true); return }
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) { setCreditsLoaded(true); return }
      const r = await fetch('/api/feature/credits', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (r.ok) {
        const d = await r.json()
        setCredits(d.credits ?? null)
      }
      setCreditsLoaded(true)
    })()
  }, [isOwner])

  const remaining = creditsRemaining(credits)

  async function doAdminFeature(slot: FeaturedSlot, hours: number) {
    setSubmitting(true); setError(null)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setSubmitting(false); return }

    const endsAt = new Date(Date.now() + hours * 3600 * 1000).toISOString()
    const res = await fetch('/api/featured-slots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ slot, content_type: contentType, content_id: contentId, ends_at: endsAt, priority: 10 }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Erreur')
      setSubmitting(false)
      return
    }
    onClose()
    alert('✅ Mis en avant.')
  }

  async function doRedeem(slot: FeaturedSlot, hours: number) {
    setSubmitting(true); setError(null)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setSubmitting(false); return }

    const res = await fetch('/api/feature/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ slot, content_type: contentType, content_id: contentId, duration_hours: hours }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Erreur')
      setSubmitting(false)
      return
    }
    onClose()
    alert('✅ Crédit utilisé, votre contenu est en avant.')
  }

  async function doBoost(offerKey: string) {
    setSubmitting(true); setError(null)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setSubmitting(false); return }

    const res = await fetch('/api/boost/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ offer_key: offerKey, content_type: contentType, content_id: contentId }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Erreur')
      setSubmitting(false)
      return
    }
    const d = await res.json()
    if (d.url) window.location.href = d.url
  }

  const offersForType = BOOST_OFFERS.filter(o => SLOT_ALLOWED_TYPES[o.slot].includes(contentType))

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 500, backgroundColor: 'rgba(0,0,0,0.5)' }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 501,
        backgroundColor: '#fff', borderRadius: '20px 20px 0 0',
        padding: '24px 22px 40px', fontFamily: 'Inter, sans-serif',
        maxHeight: '90dvh', overflowY: 'auto',
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1CCC4', margin: '0 auto 18px' }} />

        <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 900, color: '#1C1917', textAlign: 'center', letterSpacing: '-0.02em' }}>
          ⭐ Mettre en avant
        </h2>
        <p style={{ margin: '0 0 22px', fontSize: 12, color: '#6B5E4E', textAlign: 'center', fontFamily: 'Lora, serif', fontStyle: 'italic' }}>
          Boostez la visibilité de votre contenu — choisissez votre formule.
        </p>

        {/* — ADMIN — */}
        {isAdmin && (
          <Section title="🛡️ Mise en avant éditoriale" subtitle="Gratuit · admin">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {allowedSlots.map(s => (
                <SlotPicker
                  key={s.id}
                  slot={s}
                  onChoose={hours => doAdminFeature(s.id, hours)}
                  disabled={submitting}
                  hoursOptions={[24, 72, 168, 720]}
                  hoursLabels={['1j', '3j', '1 sem', '1 mois']}
                />
              ))}
            </div>
          </Section>
        )}

        {/* — PRO AVEC CRÉDIT — */}
        {!isAdmin && isOwner && creditsLoaded && plan === 'pro' && remaining > 0 && (
          <Section title="💙 Crédit Partenaire" subtitle={`${remaining} crédit${remaining > 1 ? 's' : ''} restant${remaining > 1 ? 's' : ''} ce mois-ci · 1 crédit = 1 jour`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {allowedSlots.map(s => (
                <SlotPicker
                  key={s.id}
                  slot={s}
                  onChoose={hours => doRedeem(s.id, hours)}
                  disabled={submitting}
                  hoursOptions={[24, 48, 72]}
                  hoursLabels={['1j', '2j', '3j']}
                />
              ))}
            </div>
          </Section>
        )}

        {/* — BOOST PAYANT (tout le monde) — */}
        {offersForType.length > 0 && (
          <Section
            title="🚀 Boost ponctuel"
            subtitle={
              isOwner && plan === 'pro' && remaining === 0
                ? 'Crédit épuisé ce mois-ci — boost supplémentaire'
                : 'Paiement unique sécurisé'
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {offersForType.map(o => (
                <button
                  key={o.key}
                  onClick={() => doBoost(o.key)}
                  disabled={submitting}
                  style={{
                    padding: '14px 16px', borderRadius: 14,
                    border: '1.5px solid #E5DDD2', backgroundColor: '#fff',
                    display: 'flex', alignItems: 'center', gap: 12,
                    cursor: submitting ? 'wait' : 'pointer',
                    fontFamily: 'inherit', textAlign: 'left',
                    opacity: submitting ? 0.6 : 1,
                  }}
                >
                  <span style={{ fontSize: 22 }}>{o.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#1A1209' }}>{o.label}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#7A6A5A' }}>{o.description}</p>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 900, color: '#2D5A3D' }}>{priceLabel(o.price_cents)}</span>
                </button>
              ))}
            </div>
          </Section>
        )}

        {error && (
          <p style={{ margin: '12px 0', padding: '10px 12px', borderRadius: 10, backgroundColor: '#FEF2F2', color: '#C0392B', fontSize: 12, fontWeight: 600, textAlign: 'center' }}>
            {error}
          </p>
        )}

        <button onClick={onClose} style={{
          width: '100%', marginTop: 20, padding: '12px',
          borderRadius: 999, backgroundColor: '#F0EAE0', color: '#6B5E4E',
          border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer',
          fontFamily: 'inherit',
        }}>Fermer</button>
      </div>
    </>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 900, color: '#1C1917' }}>{title}</p>
      {subtitle && <p style={{ margin: '0 0 10px', fontSize: 11, color: '#7A6A5A' }}>{subtitle}</p>}
      {children}
    </div>
  )
}

function SlotPicker({
  slot, onChoose, disabled,
  hoursOptions, hoursLabels,
}: {
  slot: { id: FeaturedSlot; label: string; description: string; emoji: string }
  onChoose: (hours: number) => void
  disabled: boolean
  hoursOptions: number[]
  hoursLabels:  string[]
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 14,
      border: '1px solid #E5DDD2', backgroundColor: '#FDFAF6',
    }}>
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          width: '100%', padding: 0, background: 'none', border: 'none',
          cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 20 }}>{slot.emoji}</span>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#1A1209' }}>{slot.label}</p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: '#7A6A5A' }}>{slot.description}</p>
        </div>
        <span style={{ color: '#8A7A6A', fontSize: 14 }}>{expanded ? '▴' : '▾'}</span>
      </button>

      {expanded && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          {hoursOptions.map((h, i) => (
            <button
              key={h}
              onClick={() => onChoose(h)}
              disabled={disabled}
              style={{
                padding: '8px 14px', borderRadius: 999,
                border: '1.5px solid #2D5A3D', backgroundColor: '#fff',
                color: '#2D5A3D', fontSize: 12, fontWeight: 800,
                fontFamily: 'inherit', cursor: disabled ? 'wait' : 'pointer',
                opacity: disabled ? 0.6 : 1,
              }}
            >{hoursLabels[i]}</button>
          ))}
        </div>
      )}
    </div>
  )
}
