'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAdminSession } from '@/hooks/useAdminSession'
import { PLANS_INFO, PLAN_ORDER, type Plan } from '@/lib/capabilities'
import type { AppNotification, NotifType } from '@/lib/types'

interface Props {
  notifications: AppNotification[]
  loading: boolean
  loaded: boolean
  onOpen: () => void
  onMarkRead: (id: string) => void
  onMarkAllRead: () => void
  onOpenProducer?: (id: string) => void
}

const NOTIF_CONFIG: Record<NotifType, { emoji: string; color: string; label: (n: AppNotification) => string }> = {
  disponibilite: {
    emoji: '🌿',
    color: '#2D5A3D',
    label: n => `${n.actor_name ?? 'Un producteur'} a un produit disponible`,
  },
  nouveau_produit: {
    emoji: '🛒',
    color: '#5B8A4A',
    label: n => `${n.actor_name ?? 'Un producteur'} a ajouté un nouveau produit`,
  },
  suivi_producteur: {
    emoji: '🌱',
    color: '#4A7C59',
    label: n => `${n.actor_name ?? 'Quelqu\'un'} suit votre fiche producteur`,
  },
  commentaire: {
    emoji: '💬',
    color: '#6B8F71',
    label: n => `${n.actor_name ?? 'Quelqu\'un'} a commenté votre fiche`,
  },
  claim_pending: {
    emoji: '📋',
    color: '#C4622D',
    label: n => `Nouvelle demande : ${n.actor_name ?? 'fiche à revendiquer'}`,
  },
  claim_approved: {
    emoji: '✓',
    color: '#2D5A3D',
    label: n => `Ta revendication a été approuvée : ${n.actor_name ?? 'fiche'}`,
  },
  claim_rejected: {
    emoji: '✕',
    color: '#A0654E',
    label: n => `Ta revendication a été refusée : ${n.actor_name ?? 'fiche'}`,
  },
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'à l\'instant'
  if (mins < 60) return `il y a ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `il y a ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `il y a ${days}j`
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

interface AdminCounts {
  total: number
  byPlan: Record<Plan, number>
  withEtab: number
  pendingClaims: number
}

export default function NotificationsView({ notifications, loading, loaded, onOpen, onMarkRead, onMarkAllRead, onOpenProducer }: Props) {
  const router = useRouter()
  const isAdmin = useAdminSession()
  const [adminCounts, setAdminCounts] = useState<AdminCounts | null>(null)

  useEffect(() => { onOpen() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Mini dashboard pour les admins : count membres par plan + claims pending
  useEffect(() => {
    if (!isAdmin) { setAdminCounts(null); return }
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return
      const [membresRes, claimsRes] = await Promise.all([
        fetch('/api/admin/membres', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/commerce-requests', { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (cancelled) return
      const membresJson = membresRes.ok ? await membresRes.json() : { membres: [] }
      const claimsJson  = claimsRes.ok  ? await claimsRes.json()  : { demandes: [] }
      const membres = (membresJson.membres ?? []) as { plan: Plan; etablissements: unknown[] }[]
      const byPlan: Record<Plan, number> = { basic: 0, pro: 0, max: 0 }
      let withEtab = 0
      membres.forEach(m => {
        if (m.plan in byPlan) byPlan[m.plan]++
        if ((m.etablissements ?? []).length > 0) withEtab++
      })
      setAdminCounts({
        total: membres.length,
        byPlan,
        withEtab,
        pendingClaims: (claimsJson.demandes ?? []).length,
      })
    })()
    return () => { cancelled = true }
  }, [isAdmin])

  const unreadCount = notifications.filter(n => !n.lu).length

  function handleClick(n: AppNotification) {
    if (!n.lu) onMarkRead(n.id)

    // Claim côté admin : ouvre la section Demandes de /admin
    if (n.type === 'claim_pending' || n.target_type === 'claim') {
      router.push('/admin?section=demandes')
      return
    }

    // Claim côté requester : ouvre la fiche établissement concernée
    if ((n.type === 'claim_approved' || n.type === 'claim_rejected') && n.target_id) {
      router.push(`/etablissement/${n.target_id}`)
      return
    }

    // Notifs producteur (legacy)
    if (n.target_type === 'producer' && n.target_id) {
      onOpenProducer?.(n.target_id)
    }
  }

  return (
    <div style={{ minHeight: '100%', backgroundColor: '#F5F0E8', fontFamily: 'Inter, sans-serif' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(140deg, #1A3A2A 0%, #2D5A3D 100%)', padding: '22px 18px 62px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', right: -30, top: -30, width: 200, height: 200, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.05)' }} />
        <div style={{ position: 'absolute', right: 60, top: 55, width: 100, height: 100, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.07)' }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 30, marginBottom: 8 }}>🔔</div>
            <h1 style={{ fontWeight: 800, fontSize: 22, color: '#fff', margin: '0 0 5px' }}>Notifications</h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', margin: 0 }}>
              {unreadCount > 0 ? `${unreadCount} non lue${unreadCount > 1 ? 's' : ''}` : 'Tout est à jour'}
            </p>
          </div>
          {unreadCount > 0 && (
            <button onClick={onMarkAllRead} style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.85)', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 20, padding: '6px 14px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', backdropFilter: 'blur(4px)' }}>
              Tout lire
            </button>
          )}
        </div>
      </div>

      {/* Mini dashboard admin */}
      {isAdmin && adminCounts && (
        <div style={{ margin: '-30px 14px 0', position: 'relative', zIndex: 2 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 18, boxShadow: '0 6px 28px rgba(0,0,0,0.1)', padding: '14px 16px', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <span style={{ fontSize: 14 }}>📊</span>
              <p style={{ fontSize: 11, fontWeight: 800, color: '#9A8A7A', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
                Tableau de bord
              </p>
              <span style={{ fontSize: 10, color: '#B0A898', marginLeft: 'auto' }}>{adminCounts.total} membres</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {PLAN_ORDER.map(p => {
                const info = PLANS_INFO[p]
                return (
                  <div key={p} style={{
                    backgroundColor: info.bgColor, borderRadius: 10,
                    padding: '10px 8px', textAlign: 'center',
                  }}>
                    <p style={{ fontSize: 20, fontWeight: 900, color: info.color, margin: '0 0 2px', fontVariantNumeric: 'tabular-nums' }}>
                      {adminCounts.byPlan[p]}
                    </p>
                    <p style={{ fontSize: 10, fontWeight: 700, color: info.color, margin: 0, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                      {info.icon} {info.label}
                    </p>
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 12, padding: '8px 4px 0', borderTop: '1px solid #F0EBE0' }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14 }}>🏪</span>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 800, color: '#2C1810', margin: 0, lineHeight: 1 }}>{adminCounts.withEtab}</p>
                  <p style={{ fontSize: 9, color: '#9A8A7A', margin: 0 }}>avec établissement</p>
                </div>
              </div>
              {adminCounts.pendingClaims > 0 && (
                <button onClick={() => router.push('/admin?section=demandes')} style={{
                  flex: 1, display: 'flex', alignItems: 'center', gap: 6,
                  background: '#FEF0F5', border: 'none', borderRadius: 10,
                  padding: '6px 10px', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                }}>
                  <span style={{ fontSize: 14 }}>📋</span>
                  <div style={{ textAlign: 'left' }}>
                    <p style={{ fontSize: 13, fontWeight: 800, color: '#EC407A', margin: 0, lineHeight: 1 }}>{adminCounts.pendingClaims}</p>
                    <p style={{ fontSize: 9, color: '#EC407A', margin: 0 }}>demandes en attente</p>
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div style={{ margin: isAdmin && adminCounts ? '0 14px' : '-30px 14px 0', position: 'relative', zIndex: 2, paddingBottom: 56 }}>
        {loading && !loaded ? (
          <div style={{ backgroundColor: '#fff', borderRadius: 18, boxShadow: '0 6px 28px rgba(0,0,0,0.1)', padding: '52px 20px', display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', border: '3px solid #E0D8CE', borderTopColor: '#2D5A3D', animation: 'spin 0.7s linear infinite' }} />
          </div>
        ) : notifications.length === 0 ? (
          <div style={{ backgroundColor: '#fff', borderRadius: 18, boxShadow: '0 6px 28px rgba(0,0,0,0.1)', padding: '52px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 54, marginBottom: 14 }}>🔕</div>
            <p style={{ fontWeight: 700, fontSize: 16, color: '#2C1810', margin: '0 0 6px' }}>Aucune notification</p>
            <p style={{ fontSize: 13, color: '#8A8A8A', margin: 0, lineHeight: 1.55 }}>Tu seras notifié quand tes producteurs favoris ont du nouveau</p>
          </div>
        ) : (
          <div style={{ backgroundColor: '#fff', borderRadius: 18, boxShadow: '0 6px 28px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            {notifications.map((n, i) => {
              const cfg = NOTIF_CONFIG[n.type]
              return (
                <div key={n.id} onClick={() => handleClick(n)} style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                  borderBottom: i < notifications.length - 1 ? '1px solid #F0EAE0' : 'none',
                  backgroundColor: n.lu ? '#fff' : '#F0F7F2',
                  cursor: 'pointer', transition: 'background 0.15s',
                }}>
                  {/* Icon bubble */}
                  <div style={{ width: 44, height: 44, borderRadius: '50%', backgroundColor: cfg.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                    {cfg.emoji}
                  </div>
                  {/* Text */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: n.lu ? 500 : 700, color: '#1C1917', margin: '0 0 3px', lineHeight: 1.4, fontFamily: 'Inter, sans-serif' }}>
                      {cfg.label(n)}
                    </p>
                    <p style={{ fontSize: 11, color: '#9A8A7A', margin: 0, fontFamily: 'Inter, sans-serif' }}>
                      {relativeDate(n.created_at)}
                    </p>
                  </div>
                  {/* Unread dot */}
                  {!n.lu && (
                    <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: cfg.color, flexShrink: 0 }} />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
