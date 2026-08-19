'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { markHubDirty } from '@/lib/hubFresh'
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
          fontFamily: 'var(--font-body), sans-serif',
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
    markHubDirty()
    onClose()
    toast.success('Mis en avant')
  }

  /** Cas spécial homepage+evenement : pas de durée, juste choisir la position
   *  (1 = grosse, 2 et 3 = mini). Le slot expire automatiquement à minuit Paris. */
  async function doAdminFeatureHomepageEvent(position: 1 | 2 | 3) {
    setSubmitting(true); setError(null)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setSubmitting(false); return }

    const res = await fetch('/api/featured-slots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        slot: 'homepage', content_type: contentType, content_id: contentId,
        position,
        // ends_at calculé côté serveur (endOfTodayParisISO), peu importe ce
        // qu'on envoie. On l'omet pour clarté.
      }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Erreur')
      setSubmitting(false)
      return
    }
    markHubDirty()
    onClose()
    toast.success(`Mis en avant · Position ${position}`)
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
    markHubDirty()
    onClose()
    toast.success('Contenu mis en avant')
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

  // Rendu via Portal sur document.body : sinon un ancêtre avec backdrop-filter
  // ou transform contraindrait notre position:fixed (cf. fiche annonce dont
  // le header sticky a backdrop-filter:blur).
  if (typeof document === 'undefined') return null

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 500, backgroundColor: 'rgba(0,0,0,0.5)' }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 501,
        backgroundColor: '#fff', borderRadius: '20px 20px 0 0',
        padding: '24px 22px 40px', fontFamily: 'var(--font-body), sans-serif',
        maxHeight: '90dvh', overflowY: 'auto',
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1CCC4', margin: '0 auto 18px' }} />

        <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 900, color: '#1C1917', textAlign: 'center', letterSpacing: '-0.02em' }}>
          ⭐ Mettre en avant
        </h2>
        <p style={{ margin: '0 0 22px', fontSize: 12, color: '#6B5E4E', textAlign: 'center', }}>
          Boostez la visibilité de votre contenu — choisissez votre formule.
        </p>

        {/* — ADMIN — */}
        {isAdmin && (
          <Section title="🛡️ Mise en avant éditoriale" subtitle="Gratuit · admin">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {allowedSlots.map(s => {
                // Cas spécial homepage+evenement : 3 positions fixes au lieu
                // d'un choix de durée. Le slot expire à minuit Paris.
                if (s.id === 'homepage' && contentType === 'evenement') {
                  return (
                    <HomepageEventPositionPicker
                      key={s.id}
                      slot={s}
                      onChoose={pos => doAdminFeatureHomepageEvent(pos)}
                      disabled={submitting}
                    />
                  )
                }
                return (
                  <SlotPicker
                    key={s.id}
                    slot={s}
                    onChoose={hours => doAdminFeature(s.id, hours)}
                    disabled={submitting}
                    hoursOptions={[24, 72, 168, 720]}
                    hoursLabels={['1j', '3j', '1 sem', '1 mois']}
                  />
                )
              })}
            </div>
          </Section>
        )}

        {/* — ADMIN : attribuer la fiche établissement à un utilisateur — */}
        {isAdmin && contentType === 'etablissement' && <AssignEtabSection etabId={contentId} />}

        {/* — PRO AVEC CRÉDIT — 1 crédit = boost Hub 48h */}
        {!isAdmin && isOwner && creditsLoaded && plan === 'pro' && remaining > 0 && (
          <Section title="💙 Crédit Partenaire" subtitle={`${remaining} crédit Partenaire ce mois-ci · 1 crédit = Hub pendant 48h`}>
            <button
              onClick={() => doRedeem('hub_hero', 48)}
              disabled={submitting}
              style={{
                width: '100%',
                padding: '14px 16px', borderRadius: 14,
                border: '1.5px solid #2D5A3D',
                backgroundColor: '#E8F2EB',
                display: 'flex', alignItems: 'center', gap: 12,
                cursor: submitting ? 'wait' : 'pointer',
                fontFamily: 'inherit', textAlign: 'left',
                opacity: submitting ? 0.6 : 1,
              }}
            >
              <span style={{ fontSize: 22 }}>🌟</span>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#1A1209' }}>
                  Utiliser mon crédit · Hub 48h
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: '#2D5A3D' }}>
                  Mise en avant dans le carrousel du hub pendant 48h
                </p>
              </div>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#2D5A3D' }}>1 crédit</span>
            </button>
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
    </>,
    document.body,
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

interface MemberLite { id: string; name: string; email: string; plan: string }

const assignBtnStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 14,
  border: '1.5px dashed #C9A23F', background: '#FBF6EC',
  color: '#A8770F', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
}

/** ADMIN : attribuer la gestion d'une fiche établissement à un membre. */
function AssignEtabSection({ etabId }: { etabId: string }) {
  const [expanded, setExpanded] = useState(false)
  const [members, setMembers]   = useState<MemberLite[] | null>(null)
  const [q, setQ]               = useState('')
  const [busy, setBusy]         = useState(false)

  async function load() {
    setExpanded(true)
    if (members) return
    const { data: { session } } = await supabase.auth.getSession()
    const tk = session?.access_token
    const r = await fetch('/api/admin/membres', { headers: tk ? { Authorization: `Bearer ${tk}` } : {} }).catch(() => null)
    if (r && r.ok) {
      const d = await r.json()
      setMembers((d.membres ?? []).map((m: { id: string; name?: string; display_name?: string; email?: string; plan?: string }) => ({
        id: m.id, name: m.name || m.display_name || '(sans nom)', email: m.email ?? '', plan: m.plan ?? 'basic',
      })))
    } else setMembers([])
  }

  async function assign(m: MemberLite) {
    if (!window.confirm(`Attribuer cette fiche à ${m.name || m.email} ?\nIl pourra la gérer, avec les avantages de son plan (${m.plan}).`)) return
    setBusy(true)
    const { data: { session } } = await supabase.auth.getSession()
    const tk = session?.access_token
    const r = await fetch(`/api/admin/etablissements/${etabId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: `Bearer ${tk}` } : {}) },
      body: JSON.stringify({ user_id: m.id }),
    }).catch(() => null)
    setBusy(false)
    if (r && r.ok) { toast.success(`Fiche attribuée à ${m.name || m.email}`); setTimeout(() => window.location.reload(), 700) }
    else { const d = r ? await r.json().catch(() => ({})) : {}; toast.error((d as { error?: string }).error || 'Échec de l’attribution') }
  }

  const s = q.trim().toLowerCase()
  const filtered = (members ?? []).filter(m => !s || m.name.toLowerCase().includes(s) || m.email.toLowerCase().includes(s)).slice(0, 15)

  return (
    <Section title="👤 Attribuer à un utilisateur" subtitle="Donne la gestion de cette fiche à un membre (avantages selon son plan)">
      {!expanded ? (
        <button onClick={load} style={assignBtnStyle}>Choisir un utilisateur…</button>
      ) : (
        <>
          <input
            value={q} onChange={e => setQ(e.target.value)} autoFocus
            placeholder="Rechercher un membre (nom ou email)…"
            style={{ width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: 12, border: '1.5px solid #E5DDD2', fontSize: 13, outline: 'none', marginBottom: 8, color: '#1A1209', WebkitTextFillColor: '#1A1209', backgroundColor: '#FDFAF6' }}
          />
          {members === null && <p style={{ fontSize: 12, color: '#7A6A5A', textAlign: 'center', padding: 8 }}>Chargement…</p>}
          {members !== null && filtered.length === 0 && <p style={{ fontSize: 12, color: '#7A6A5A', textAlign: 'center', padding: 8 }}>Aucun membre.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
            {filtered.map(m => (
              <button key={m.id} onClick={() => assign(m)} disabled={busy}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, border: '1px solid #E5DDD2', background: '#fff', cursor: busy ? 'wait' : 'pointer', textAlign: 'left', fontFamily: 'inherit', opacity: busy ? 0.6 : 1 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1209', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', WebkitTextFillColor: '#1A1209' }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: '#7A6A5A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', WebkitTextFillColor: '#7A6A5A' }}>{m.email}</div>
                </div>
                <span style={{ flexShrink: 0, padding: '3px 9px', borderRadius: 999, fontSize: 10, fontWeight: 800, background: m.plan === 'pro' ? '#E8F2EB' : '#F0EAE0', color: m.plan === 'pro' ? '#2D5A3D' : '#7A6A5A', textTransform: 'uppercase' }}>{m.plan}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </Section>
  )
}

/**
 * Picker spécifique homepage+evenement : 3 positions fixes au lieu d'un
 * choix de durée. La durée est implicite (jusqu'à minuit Paris).
 *  Position 1 = grosse tuile en haut.
 *  Position 2 = mini tuile gauche.
 *  Position 3 = mini tuile droite.
 */
function HomepageEventPositionPicker({
  slot, onChoose, disabled,
}: {
  slot: { id: FeaturedSlot; label: string; description: string; emoji: string }
  onChoose: (position: 1 | 2 | 3) => void
  disabled: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const POSITIONS: { value: 1 | 2 | 3; label: string; sub: string }[] = [
    { value: 1, label: 'Position 1', sub: 'Grosse tuile' },
    { value: 2, label: 'Position 2', sub: 'Mini gauche' },
    { value: 3, label: 'Position 3', sub: 'Mini droite' },
  ]
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
          <p style={{ margin: '2px 0 0', fontSize: 11, color: '#7A6A5A' }}>
            Choisis la position dans la section &laquo;&nbsp;Aujourd&apos;hui&nbsp;&raquo; · expire à minuit
          </p>
        </div>
        <span style={{ color: '#8A7A6A', fontSize: 14 }}>{expanded ? '▴' : '▾'}</span>
      </button>

      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          {POSITIONS.map(p => (
            <button
              key={p.value}
              onClick={() => onChoose(p.value)}
              disabled={disabled}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 12,
                border: '1.5px solid #2D5A3D', backgroundColor: '#fff',
                cursor: disabled ? 'wait' : 'pointer',
                opacity: disabled ? 0.6 : 1,
                fontFamily: 'inherit', textAlign: 'left',
              }}
            >
              <span style={{
                width: 28, height: 28, borderRadius: 8,
                backgroundColor: '#E8F2EB', color: '#2D5A3D',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 900, flexShrink: 0,
              }}>
                {p.value}
              </span>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#1A1209' }}>{p.label}</p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: '#7A6A5A' }}>{p.sub}</p>
              </div>
            </button>
          ))}
        </div>
      )}
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
