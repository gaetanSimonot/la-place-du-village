'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import { toUserContext, can } from '@/lib/capabilities'
import { UpgradeModal } from '@/components/HubModals'
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
  const ctx = toUserContext(profile, isAdmin)
  const userHasAccess = can(ctx, 'promo_pro')

  const [promos, setPromos] = useState<Promotion[]>([])
  const [loading, setLoading] = useState(true)
  const [using, setUsing] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [showUpgrade, setShowUpgrade] = useState(false)
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

  const showToastMsg = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  // Étape 1 : clic "J'en profite" → ouvre la modale de confirmation position
  const openUseConfirm = (promo: Promotion) => {
    if (!user) { openAuthModal('/promotions'); return }
    if (!userHasAccess) { setShowUpgrade(true); return }
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
      setShowUpgrade(true)
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
        padding: '32px 20px 40px',
        position: 'relative', overflow: 'hidden',
        color: '#fff',
      }}>
        <button onClick={() => router.push('/')} style={{
          background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none',
          borderRadius: 999, padding: '6px 14px', fontSize: 12, fontWeight: 700,
          cursor: 'pointer', marginBottom: 14, fontFamily: 'Inter, sans-serif',
        }}>
          ← Accueil
        </button>
        <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.7, margin: '0 0 6px' }}>
          🎁 Promotions locales
        </p>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
          Vos avantages près de chez vous
        </h1>
        <p style={{ fontSize: 13, opacity: 0.85, margin: 0, maxWidth: 360 }}>
          Profitez d&apos;offres exclusives chez vos commerçants partenaires Pro/Max.
        </p>
      </div>

      {/* Liste */}
      <div style={{ padding: '18px 16px 80px' }}>

        {!userHasAccess && user && (
          <div style={{
            backgroundColor: '#FEF3E5', border: '1px solid #F0D9B8',
            borderRadius: 14, padding: '12px 14px', marginBottom: 14,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 18 }}>ℹ️</span>
            <p style={{ fontSize: 12, color: '#7A5614', margin: 0, lineHeight: 1.5, flex: 1 }}>
              Vous voyez les promos disponibles. Pour en profiter, passez en <strong>Pro ou Max</strong>.
            </p>
          </div>
        )}

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
            <p style={{ fontSize: 40, margin: '0 0 12px' }}>🎁</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#7A6A5A' }}>
              {typeFilter ? 'Aucune promo dans cette catégorie' : 'Aucune promo en cours'}
            </p>
            <p style={{ fontSize: 12, margin: '6px 0 0' }}>
              {typeFilter
                ? <button onClick={() => setTypeFilter(null)} style={{ background: 'none', border: 'none', color: '#C4622D', textDecoration: 'underline', cursor: 'pointer', fontSize: 12, fontFamily: 'Inter, sans-serif' }}>Voir toutes les catégories</button>
                : 'Reviens plus tard, les commerçants en publient régulièrement'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {filteredPromos.map(p => (
              <PromoCard
                key={p.id}
                promo={p}
                onUse={() => openUseConfirm(p)}
                disabled={using === p.id}
                userHasAccess={userHasAccess}
              />
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

      {showUpgrade && (
        <UpgradeModal
          requiredPlan="pro"
          label="Profiter des promotions locales"
          onClose={() => setShowUpgrade(false)}
          onGoToPlan={() => router.push('/profil')}
        />
      )}
    </div>
  )
}

function PromoCard({ promo, onUse, disabled, userHasAccess }: {
  promo: Promotion
  onUse: () => void
  disabled: boolean
  userHasAccess: boolean
}) {
  const router = useRouter()
  return (
    <div style={{
      backgroundColor: '#fff', borderRadius: 18,
      boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
      overflow: 'hidden',
    }}>
      {/* Image hero (custom ou fallback sur la photo de l'établissement) */}
      {promo.display_image_url && (
        <img
          src={promo.display_image_url}
          alt={promo.title}
          style={{ width: '100%', height: 130, objectFit: 'cover', display: 'block' }}
        />
      )}

      <div style={{ padding: '14px 16px 16px' }}>
        {/* Établissement */}
        {promo.etablissement && (
          <button onClick={() => router.push(`/etablissement/${promo.etablissement!.id}`)} style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, overflow: 'hidden', backgroundColor: '#E8F2EB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {promo.etablissement.photos?.[0]
                ? <img src={promo.etablissement.photos[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: 14 }}>🏪</span>}
            </div>
            <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#1C1917', margin: 0 }}>
                {promo.etablissement.nom}
              </p>
              {promo.etablissement.commune && (
                <p style={{ fontSize: 10, color: '#9A8A7A', margin: 0 }}>
                  {promo.etablissement.commune}
                </p>
              )}
            </div>
            <span style={{ color: '#C8B8A8', fontSize: 14 }}>›</span>
          </button>
        )}

        {/* Titre + desc */}
        <h3 style={{ fontSize: 16, fontWeight: 800, color: '#1A1209', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
          {promo.title}
        </h3>
        {promo.description && (
          <p style={{ fontSize: 13, color: '#7A6A5A', margin: '0 0 8px', lineHeight: 1.5 }}>
            {promo.description}
          </p>
        )}
        {promo.conditions && (
          <p style={{ fontSize: 11, color: '#9A8A7A', margin: '0 0 12px', fontStyle: 'italic' }}>
            ⚡ {promo.conditions}
          </p>
        )}

        {/* Métadonnées */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 10, fontWeight: 700, color: '#3F7A52',
            backgroundColor: '#E8F2EB', padding: '3px 8px', borderRadius: 999,
          }}>
            {FREQ_LABEL[promo.frequency] ?? promo.frequency}
          </span>
          {promo.use_count > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: '#7A6A5A',
              backgroundColor: '#F5EFE5', padding: '3px 8px', borderRadius: 999,
            }}>
              ★ {promo.use_count} utilisation{promo.use_count > 1 ? 's' : ''}
            </span>
          )}
          {promo.valid_until && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: '#A0654E',
              backgroundColor: '#FFF0E5', padding: '3px 8px', borderRadius: 999,
            }}>
              Jusqu&apos;au {new Date(promo.valid_until).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
            </span>
          )}
        </div>

        {/* CTA */}
        <button
          onClick={onUse}
          disabled={disabled}
          style={{
            width: '100%', padding: '12px',
            backgroundColor: userHasAccess ? '#C4622D' : '#9A8A7A',
            color: '#fff', border: 'none', borderRadius: 12,
            fontSize: 14, fontWeight: 700, cursor: disabled ? 'default' : 'pointer',
            opacity: disabled ? 0.6 : 1,
            fontFamily: 'Inter, sans-serif',
          }}
        >
          {disabled ? '…' : userHasAccess ? "🎁 J'en profite" : '🔒 Passer Pro pour en profiter'}
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
