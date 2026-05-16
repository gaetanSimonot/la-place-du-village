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
  promo_used: {
    emoji: '🎁',
    color: '#C4622D',
    label: n => `${n.actor_name ?? 'Un client'} a utilisé votre promo`,
  },
  annonce_interet_recu: {
    emoji: '⭐',
    color: '#E8622A',
    label: n => `${n.actor_name ?? 'Quelqu\'un'} s'intéresse à votre annonce`,
  },
  annonce_enchere_prise: {
    emoji: '🔨',
    color: '#3A5BC7',
    label: n => `${n.actor_name ?? 'Quelqu\'un'} a pris votre enchère`,
  },
  annonce_expire_bientot: {
    emoji: '⏳',
    color: '#8A7A6A',
    label: () => 'Votre annonce expire dans 2 jours',
  },
  annonce_devient_don: {
    emoji: '🎁',
    color: '#2D5A3D',
    label: () => 'Votre enchère a atteint le seuil — l\'annonce est devenue un don',
  },
  annonce_message: {
    emoji: '💬',
    color: '#3A5BC7',
    label: n => `${n.actor_name ?? 'Quelqu\'un'} vous a envoyé un message`,
  },
  annonce_contact_partage: {
    emoji: '📞',
    color: '#2D5A3D',
    label: () => 'Le vendeur a partagé ses coordonnées',
  },
  annonce_vente_close: {
    emoji: '✅',
    color: '#2D5A3D',
    label: n => `${n.actor_name ?? 'L\'autre partie'} a conclu la vente`,
  },
  annonce_note_recue: {
    emoji: '⭐',
    color: '#E8A627',
    label: n => `${n.actor_name ?? 'Un acheteur'} vous a noté`,
  },
  event_published: {
    emoji: '🎉',
    color: '#2D5A3D',
    label: n => `Ton événement est publié : ${n.actor_name ?? 'événement'}`,
  },
  support_message: {
    emoji: '💬',
    color: '#2D5A3D',
    label: n => `${n.actor_name ?? 'Quelqu\'un'} — nouveau message support`,
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

interface PromoUseHistory {
  id: string
  used_at: string
  title: string
  image_url: string | null
  etablissement: { nom: string; commune: string | null } | null
}

export default function NotificationsView({ notifications, loading, loaded, onOpen, onMarkRead, onMarkAllRead, onOpenProducer }: Props) {
  const router = useRouter()
  const isAdmin = useAdminSession()
  const [adminCounts, setAdminCounts] = useState<AdminCounts | null>(null)
  const [promoHistory, setPromoHistory] = useState<PromoUseHistory[]>([])
  const [showAllHistory, setShowAllHistory] = useState(false)
  const [adminFilter, setAdminFilter] = useState<'all' | 'unread' | 'demandes' | 'annonces' | 'events' | 'support' | 'boost'>('all')

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
      const byPlan: Record<Plan, number> = { basic: 0, habitants: 0, pro: 0 }
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

  // Historique promos utilisées par le user
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const r = await fetch('/api/profile/promotions-used', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!r.ok || cancelled) return
      const d = await r.json()
      setPromoHistory(d.uses ?? [])
    })()
    return () => { cancelled = true }
  }, [])

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

    // Notifs conversation (intérêt, message, contact, vente close) → ouvre le chat
    if (n.target_type === 'conversation' && n.target_id) {
      router.push(`/annonces/conversations/${n.target_id}`)
      return
    }

    // Notifs support → ouvre le ticket (route différente selon admin / user)
    if (n.target_type === 'support_conversation' && n.target_id) {
      router.push(isAdmin ? `/admin/support/${n.target_id}` : `/support/${n.target_id}`)
      return
    }

    // Notifs annonces (expiration, bascule don) → ouvre la fiche annonce
    if (n.target_type === 'annonce' && n.target_id) {
      router.push(`/annonces/${n.target_id}`)
      return
    }

    // Notif "ton événement est publié" → ouvre la fiche event
    if (n.target_type === 'event' && n.target_id) {
      router.push(`/evenement/${n.target_id}`)
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

      {/* Filtre admin */}
      {isAdmin && notifications.length > 0 && (
        <div style={{ margin: adminCounts ? '0 14px 10px' : '-30px 14px 10px 14px', position: 'relative', zIndex: 2, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {([
            { id: 'all',       label: `Tout (${notifications.length})` },
            { id: 'unread',    label: `Non lues (${notifications.filter(n => !n.lu).length})` },
            { id: 'demandes',  label: '📋 Demandes' },
            { id: 'annonces',  label: '🏷 Annonces' },
            { id: 'events',    label: '🎉 Events' },
            { id: 'support',   label: '💬 Support' },
            { id: 'boost',     label: '🚀 Boost' },
          ] as const).map(f => {
            const active = adminFilter === f.id
            return (
              <button
                key={f.id}
                onClick={() => setAdminFilter(f.id)}
                style={{
                  padding: '6px 11px', borderRadius: 999,
                  border: '1.5px solid #E5DDD2',
                  backgroundColor: active ? '#1A1209' : '#fff',
                  color: active ? '#fff' : '#7A6A5A',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'inherit', whiteSpace: 'nowrap',
                }}
              >{f.label}</button>
            )
          })}
        </div>
      )}

      {/* Content */}
      <div style={{ margin: isAdmin && (adminCounts || notifications.length > 0) ? '0 14px' : '-30px 14px 0', position: 'relative', zIndex: 2, paddingBottom: 56 }}>
        {(() => {
          const filtered = !isAdmin || adminFilter === 'all'
            ? notifications
            : adminFilter === 'unread'   ? notifications.filter(n => !n.lu)
            : adminFilter === 'demandes' ? notifications.filter(n => n.type === 'claim_pending' || n.type === 'claim_approved' || n.type === 'claim_rejected')
            : adminFilter === 'annonces' ? notifications.filter(n => n.type.startsWith('annonce_'))
            : adminFilter === 'events'   ? notifications.filter(n => n.type === 'event_published' || n.type === 'disponibilite' || n.type === 'nouveau_produit' || n.type === 'suivi_producteur' || n.type === 'commentaire')
            : adminFilter === 'support'  ? notifications.filter(n => n.type === 'support_message')
            : adminFilter === 'boost'    ? notifications.filter(n => n.type === 'promo_used' || n.actor_name?.includes('Boost') || n.actor_name?.includes('boost'))
            : notifications
          return loading && !loaded ? (
          <div style={{ backgroundColor: '#fff', borderRadius: 18, boxShadow: '0 6px 28px rgba(0,0,0,0.1)', padding: '52px 20px', display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', border: '3px solid #E0D8CE', borderTopColor: '#2D5A3D', animation: 'spin 0.7s linear infinite' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ backgroundColor: '#fff', borderRadius: 18, boxShadow: '0 6px 28px rgba(0,0,0,0.1)', padding: '52px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 54, marginBottom: 14 }}>🔕</div>
            <p style={{ fontWeight: 700, fontSize: 16, color: '#2C1810', margin: '0 0 6px' }}>{notifications.length === 0 ? 'Aucune notification' : 'Aucun résultat'}</p>
            <p style={{ fontSize: 13, color: '#8A8A8A', margin: 0, lineHeight: 1.55 }}>{notifications.length === 0 ? 'Tu seras notifié quand tes producteurs favoris ont du nouveau' : 'Aucune notification dans cette catégorie.'}</p>
          </div>
        ) : (
          <div style={{ backgroundColor: '#fff', borderRadius: 18, boxShadow: '0 6px 28px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            {filtered.map((n, i) => {
              const cfg = NOTIF_CONFIG[n.type]
              return (
                <div key={n.id} onClick={() => handleClick(n)} style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                  borderBottom: i < filtered.length - 1 ? '1px solid #F0EAE0' : 'none',
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
        )
        })()}
      </div>

      {/* Historique promos utilisées */}
      {promoHistory.length > 0 && (
        <div style={{ margin: '0 14px 24px', position: 'relative', zIndex: 2 }}>
          <button
            onClick={() => setShowAllHistory(s => !s)}
            style={{
              width: '100%', padding: '12px 14px',
              backgroundColor: '#fff', border: 'none',
              borderRadius: 14, boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              cursor: 'pointer', fontFamily: 'Inter, sans-serif',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>🎁</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#C4622D', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Mes promos utilisées ({promoHistory.length})
              </span>
            </div>
            <span style={{ fontSize: 14, color: '#9A8A7A', transform: showAllHistory ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
          </button>

          {showAllHistory && (
            <div style={{ marginTop: 8, backgroundColor: '#fff', borderRadius: 14, padding: '6px 12px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
              {promoHistory.map(h => (
                <div key={h.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 0', borderBottom: '1px solid #F5F0E8',
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8,
                    overflow: 'hidden', flexShrink: 0,
                    backgroundColor: '#FFF0E5',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {h.image_url
                      ? <img src={h.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: 16 }}>🎁</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#1A1209', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {h.title}
                    </p>
                    {h.etablissement && (
                      <p style={{ fontSize: 10, color: '#9A8A7A', margin: '1px 0 0' }}>
                        {h.etablissement.nom}{h.etablissement.commune ? ` · ${h.etablissement.commune}` : ''}
                      </p>
                    )}
                  </div>
                  <span style={{ fontSize: 10, color: '#B0A898' }}>{relativeDate(h.used_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
