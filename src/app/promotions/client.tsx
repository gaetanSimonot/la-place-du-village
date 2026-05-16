'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import SubscriptionModal from '@/components/SubscriptionModal'
import FeatureButton from '@/components/FeatureButton'
import type { Plan } from '@/lib/capabilities'
import { ETAB_TYPES } from '@/lib/etablissement-types'
import type { EtablissementType } from '@/lib/types'

interface Promotion {
  id: string
  title: string
  description: string | null
  image_url: string | null
  display_image_url: string | null
  conditions: string | null
  frequency: 'always' | 'weekly' | 'monthly'
  valid_from: string | null
  valid_until: string | null
  use_count: number
  etablissement: {
    id: string
    nom: string
    commune: string | null
    photos: string[] | null
    type: EtablissementType | null
    lat?: number | null
    lng?: number | null
  } | null
}

const FREQ_LABEL: Record<string, string> = {
  always:  '1 fois maximum',
  weekly:  '1× par semaine',
  monthly: '1× par mois',
}

export default function PromotionsClient() {
  const router = useRouter()
  const { user, profile, isAdmin } = useAuth()
  const { openAuthModal } = useAuthModal()
  const currentPlan = (profile?.plan as Plan) ?? 'basic'

  const [promos, setPromos] = useState<Promotion[]>([])
  const [loading, setLoading] = useState(true)
  const [using, setUsing] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [upgradePromo, setUpgradePromo] = useState<Promotion | null>(null)
  const [typeFilter, setTypeFilter] = useState<EtablissementType | null>(null)
  const [confirmModal, setConfirmModal] = useState<Promotion | null>(null)

  const fetchPromos = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/promotions')
    if (r.ok) {
      const d = await r.json()
      setPromos(d.promotions ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchPromos() }, [fetchPromos])

  // Scroll vers la promo ciblée si on arrive depuis le hub avec ?id=...
  // On lit window.location pour éviter le bailout CSR de useSearchParams.
  useEffect(() => {
    if (loading || promos.length === 0) return
    if (typeof window === 'undefined') return
    const id = new URLSearchParams(window.location.search).get('id')
    if (!id) return
    const el = document.getElementById(`promo-${id}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      // Petit highlight visuel via outline temporaire
      el.style.outline = '3px solid #E8622A'
      el.style.outlineOffset = '4px'
      el.style.borderRadius = '18px'
      setTimeout(() => {
        el.style.outline = ''
        el.style.outlineOffset = ''
      }, 2000)
    }
  }, [loading, promos.length])

  const showToastMsg = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  // Étape 1 : clic "J'en profite" → ouvre la modale de confirmation position.
  // Le quota basic (1/mois) est vérifié côté API ; on laisse passer ici.
  const openUseConfirm = (promo: Promotion) => {
    if (!user) { openAuthModal('/promotions'); return }
    setConfirmModal(promo)
  }

  // Étape 2 : user confirme qu'il est sur place → POST API
  const confirmUse = async (promo: Promotion) => {
    setUsing(promo.id)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setUsing(null); return }
    const res = await fetch(`/api/promotions/${promo.id}/use`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    setUsing(null)
    setConfirmModal(null)
    const d = await res.json().catch(() => ({}))
    if (res.ok) {
      showToastMsg('✓ Promo enregistrée — bon appétit !')
      fetchPromos()
    } else if (d.upgradeRequired) {
      setUpgradePromo(promo)
    } else {
      showToastMsg(d.error ?? 'Erreur')
    }
  }

  // Liste filtrée par type
  const filteredPromos = useMemo(() => {
    if (!typeFilter) return promos
    return promos.filter(p => p.etablissement?.type === typeFilter)
  }, [promos, typeFilter])

  // Types réellement présents dans les promos (pas tous les types possibles)
  const availableTypes = useMemo(() => {
    const set = new Set<EtablissementType>()
    promos.forEach(p => { if (p.etablissement?.type) set.add(p.etablissement.type) })
    return Array.from(set)
  }, [promos])

  return (
    <div style={{ minHeight: '100dvh', backgroundColor: 'var(--creme)', fontFamily: 'Inter, sans-serif' }}>

      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #1A3A2A 0%, #2D5A3D 60%, #3F7A52 100%)',
        padding: '20px 18px 22px',
        position: 'relative', overflow: 'hidden',
        color: '#fff',
      }}>
        <button onClick={() => router.push('/')} style={{
          background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none',
          borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 700,
          cursor: 'pointer', marginBottom: 10, fontFamily: 'Inter, sans-serif',
        }}>
          ← Accueil
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
          Bons plans du village
        </h1>
        <p style={{ fontSize: 12.5, opacity: 0.82, margin: 0, maxWidth: 360, lineHeight: 1.45 }}>
          Offres exclusives chez vos commerçants partenaires.
        </p>
      </div>

      {/* Liste */}
      <div style={{ padding: '18px 16px 80px' }}>

        {/* Filtres par type d'établissement */}
        {!loading && availableTypes.length > 1 && (
          <div style={{
            display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 14,
            paddingBottom: 4,
          }} className="pdv-hscroll">
            <button
              onClick={() => setTypeFilter(null)}
              style={{
                flexShrink: 0, padding: '7px 14px', borderRadius: 999,
                border: typeFilter === null ? '2px solid #C4622D' : '1.5px solid #E0D8CE',
                backgroundColor: typeFilter === null ? '#FFF0E5' : '#fff',
                color: typeFilter === null ? '#C4622D' : '#7A6A5A',
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              Tout
            </button>
            {availableTypes.map(t => {
              const info = ETAB_TYPES[t]
              const active = typeFilter === t
              return (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  style={{
                    flexShrink: 0, padding: '7px 14px', borderRadius: 999,
                    border: active ? `2px solid ${info.color}` : '1.5px solid #E0D8CE',
                    backgroundColor: active ? info.bg : '#fff',
                    color: active ? info.color : '#7A6A5A',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    fontFamily: 'Inter, sans-serif',
                  }}
                >
                  {info.emoji} {info.label}
                </button>
              )
            })}
          </div>
        )}
        <style>{`.pdv-hscroll { scrollbar-width: none; -webkit-overflow-scrolling: touch; } .pdv-hscroll::-webkit-scrollbar { display: none; }`}</style>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9A8A7A' }}>
            Chargement…
          </div>
        ) : filteredPromos.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#9A8A7A' }}>
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#C8B8A8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 12px' }}>
              <polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/>
              <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
            </svg>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#7A6A5A', margin: 0 }}>
              {typeFilter ? 'Aucune promo dans cette catégorie' : 'Aucune promo en cours'}
            </p>
            <p style={{ fontSize: 12, margin: '6px 0 0' }}>
              {typeFilter
                ? <button onClick={() => setTypeFilter(null)} style={{ background: 'none', border: 'none', color: '#C4622D', textDecoration: 'underline', cursor: 'pointer', fontSize: 12, fontFamily: 'Inter, sans-serif' }}>Voir toutes les catégories</button>
                : 'Reviens plus tard, les commerçants en publient régulièrement'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {filteredPromos.map(p => (
              <div key={p.id} id={`promo-${p.id}`} style={{ scrollMarginTop: 80, position: 'relative' }}>
                {isAdmin && (
                  <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 5 }}>
                    <FeatureButton contentType="promotion" contentId={p.id} />
                  </div>
                )}
                <PromoCard
                  promo={p}
                  onUse={() => openUseConfirm(p)}
                  disabled={using === p.id}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modale de confirmation "Êtes-vous sur place ?" */}
      {confirmModal && (
        <ConfirmPositionModal
          promo={confirmModal}
          onClose={() => setConfirmModal(null)}
          onConfirm={() => confirmUse(confirmModal)}
          loading={using === confirmModal.id}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          backgroundColor: '#2C1810', color: '#fff',
          padding: '12px 22px', borderRadius: 999, fontSize: 13, fontWeight: 600,
          boxShadow: '0 4px 18px rgba(0,0,0,0.25)', zIndex: 50,
          maxWidth: '90%', textAlign: 'center', fontFamily: 'Inter, sans-serif',
        }}>
          {toast}
        </div>
      )}

      {upgradePromo && (
        <SubscriptionModal
          context={{ kind: 'promo', promoTitle: upgradePromo.title }}
          onClose={() => setUpgradePromo(null)}
          currentPlan={currentPlan}
        />
      )}
    </div>
  )
}

function PromoCard({ promo, onUse, disabled }: {
  promo: Promotion
  onUse: () => void
  disabled: boolean
}) {
  return (
    <div style={{
      backgroundColor: '#fff', borderRadius: 14,
      boxShadow: '0 2px 8px rgba(44,28,16,0.06)',
      overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      height: '100%',
    }}>
      {/* Image hero */}
      <div style={{ position: 'relative', height: 110, backgroundColor: '#F0EBE3', overflow: 'hidden' }}>
        {promo.display_image_url ? (
          <img src={promo.display_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C8B8A8' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/>
              <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
            </svg>
          </div>
        )}
        <span style={{
          position: 'absolute', top: 6, left: 6,
          backgroundColor: '#E8622A', color: '#fff',
          fontSize: 9, fontWeight: 800,
          padding: '2px 7px', borderRadius: 999,
          letterSpacing: '0.04em',
        }}>BON PLAN</span>
      </div>

      <div style={{ padding: '9px 10px 10px', display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
        {/* Étab (texte simple, pas un bouton — toute la card est cliquable via le CTA) */}
        {promo.etablissement && (
          <p style={{ fontSize: 10.5, fontWeight: 600, color: '#8A7A6A', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            {promo.etablissement.nom}
          </p>
        )}

        {/* Titre */}
        <h3 style={{
          fontSize: 13, fontWeight: 800, color: '#1A1209',
          margin: 0, letterSpacing: '-0.01em', lineHeight: 1.2,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {promo.title}
        </h3>

        {/* Fréquence + validité (compact) */}
        <p style={{ fontSize: 10.5, color: '#9A8A7A', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {FREQ_LABEL[promo.frequency] ?? promo.frequency}
          {promo.valid_until && ` · ${new Date(promo.valid_until).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`}
        </p>

        {/* CTA */}
        <button
          onClick={onUse}
          disabled={disabled}
          style={{
            marginTop: 'auto',
            padding: '8px 10px', borderRadius: 10,
            backgroundColor: '#C4622D',
            color: '#fff', border: 'none',
            fontSize: 12, fontWeight: 700, cursor: disabled ? 'default' : 'pointer',
            opacity: disabled ? 0.6 : 1,
            fontFamily: 'Inter, sans-serif',
            letterSpacing: '-0.01em',
          }}
        >
          {disabled ? '…' : "J'en profite"}
        </button>
      </div>
    </div>
  )
}

function ConfirmPositionModal({ promo, onClose, onConfirm, loading }: {
  promo: Promotion
  onClose: () => void
  onConfirm: () => void
  loading: boolean
}) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 3000,
      backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      fontFamily: 'Inter, sans-serif',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 480, backgroundColor: '#fff',
        borderRadius: '24px 24px 0 0', padding: '24px 24px 28px',
        paddingBottom: 'max(28px, env(safe-area-inset-bottom, 28px))',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 48, marginBottom: 10 }}>📍</div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1A1209', margin: '0 0 6px', letterSpacing: '-0.01em' }}>
            Êtes-vous sur place ?
          </h2>
          <p style={{ fontSize: 13, color: '#7A6A5A', margin: '0 0 4px', lineHeight: 1.5 }}>
            Vous allez profiter de la promo <strong style={{ color: '#1A1209' }}>« {promo.title} »</strong>
          </p>
          {promo.etablissement && (
            <p style={{ fontSize: 12, color: '#9A8A7A', margin: 0 }}>
              chez <strong>{promo.etablissement.nom}</strong>{promo.etablissement.commune ? ` · ${promo.etablissement.commune}` : ''}
            </p>
          )}
        </div>

        <div style={{
          backgroundColor: '#FFF7E5', borderRadius: 12,
          padding: '10px 14px', marginBottom: 16,
          border: '1px solid #F0D9B8',
        }}>
          <p style={{ fontSize: 11, color: '#7A5614', margin: 0, lineHeight: 1.5 }}>
            <strong>Bon usage :</strong> ne validez la promo que si vous êtes vraiment chez le commerçant. Le commerçant sera notifié de votre passage.
          </p>
        </div>

        <button
          onClick={onConfirm}
          disabled={loading}
          style={{
            width: '100%', padding: '14px',
            backgroundColor: '#C4622D', color: '#fff',
            border: 'none', borderRadius: 14,
            fontSize: 14, fontWeight: 700,
            cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.6 : 1,
            fontFamily: 'Inter, sans-serif', marginBottom: 8,
          }}
        >
          {loading ? '…' : '✓ Oui, je confirme ma présence'}
        </button>
        <button
          onClick={onClose}
          style={{
            width: '100%', padding: '10px',
            background: 'none', border: 'none',
            fontSize: 12, color: '#9A8A7A',
            cursor: 'pointer', fontFamily: 'Inter, sans-serif',
          }}
        >
          Annuler
        </button>
      </div>
    </div>
  )
}
