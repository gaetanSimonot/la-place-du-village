'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { FEATURED_SLOTS, type FeaturedSlotRow } from '@/lib/featured'

interface EnrichedSlot extends FeaturedSlotRow {
  title?: string
  imageUrl?: string | null
  detailUrl?: string
}

function fmtRemaining(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - Date.now()
  if (ms <= 0) return 'expiré'
  const h = Math.floor(ms / 3600000)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}j`
}

export default function AdminHubCarousel() {
  const router = useRouter()
  const { user, isAdmin, loading: authLoading } = useAuth()
  const [allSlots, setAllSlots] = useState<EnrichedSlot[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [showExpired, setShowExpired] = useState(false)

  useEffect(() => {
    if (authLoading) return
    if (!user || !isAdmin) {
      router.replace('/')
      return
    }
    reload()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, isAdmin, showExpired])

  async function reload() {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return
    const res = await fetch(`/api/featured-slots?all=${showExpired ? '1' : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Erreur')
      setLoading(false)
      return
    }
    const { slots } = await res.json()
    const enriched = await enrich(slots as FeaturedSlotRow[])
    setAllSlots(enriched)
    setLoading(false)
  }

  async function enrich(slots: FeaturedSlotRow[]): Promise<EnrichedSlot[]> {
    if (!slots.length) return []

    const byType: Record<string, string[]> = {}
    slots.forEach(s => {
      byType[s.content_type] ??= []
      byType[s.content_type].push(s.content_id)
    })

    const titleMap: Record<string, { title: string; imageUrl: string | null; detailUrl: string }> = {}

    if (byType.evenement) {
      const { data } = await supabase
        .from('evenements')
        .select('id, titre, image_url')
        .in('id', byType.evenement)
      ;(data ?? []).forEach(d => { titleMap[`evenement:${d.id}`] = { title: d.titre, imageUrl: d.image_url, detailUrl: `/evenement/${d.id}` } })
    }
    if (byType.etablissement) {
      const { data } = await supabase
        .from('etablissements')
        .select('id, nom, photos')
        .in('id', byType.etablissement)
      ;(data ?? []).forEach(d => { titleMap[`etablissement:${d.id}`] = { title: d.nom, imageUrl: d.photos?.[0] ?? null, detailUrl: `/etablissement/${d.id}` } })
    }
    if (byType.producteur) {
      const { data } = await supabase
        .from('producers')
        .select('id, nom, photos')
        .in('id', byType.producteur)
      ;(data ?? []).forEach(d => { titleMap[`producteur:${d.id}`] = { title: d.nom, imageUrl: d.photos?.[0] ?? null, detailUrl: `/producteur/${d.id}` } })
    }
    if (byType.annonce) {
      const { data } = await supabase
        .from('annonces')
        .select('id, titre, photos')
        .in('id', byType.annonce)
      ;(data ?? []).forEach(d => { titleMap[`annonce:${d.id}`] = { title: d.titre, imageUrl: d.photos?.[0] ?? null, detailUrl: `/annonces/${d.id}` } })
    }
    if (byType.promotion) {
      const { data } = await supabase
        .from('promotions')
        .select('id, title, image_url')
        .in('id', byType.promotion)
      ;(data ?? []).forEach(d => { titleMap[`promotion:${d.id}`] = { title: d.title, imageUrl: d.image_url, detailUrl: `/promotions?id=${d.id}` } })
    }

    return slots.map(s => ({
      ...s,
      title:     titleMap[`${s.content_type}:${s.content_id}`]?.title ?? '(contenu introuvable)',
      imageUrl:  titleMap[`${s.content_type}:${s.content_id}`]?.imageUrl ?? null,
      detailUrl: titleMap[`${s.content_type}:${s.content_id}`]?.detailUrl,
    }))
  }

  async function patchSlot(id: string, patch: Record<string, unknown>) {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return
    const res = await fetch('/api/featured-slots', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, ...patch }),
    })
    if (res.ok) reload()
  }

  async function deleteSlot(id: string) {
    if (!confirm('Supprimer ce slot ?')) return
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return
    const res = await fetch(`/api/featured-slots?id=${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) reload()
  }

  function bumpPriority(slot: EnrichedSlot, delta: number) {
    patchSlot(slot.id, { priority: slot.priority + delta })
  }

  function extendDuration(slot: EnrichedSlot, hours: number) {
    const newEnd = new Date(new Date(slot.ends_at).getTime() + hours * 3600 * 1000).toISOString()
    patchSlot(slot.id, { ends_at: newEnd })
  }

  if (authLoading || loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2EBE0' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '4px solid #E0D8CE', borderTopColor: '#2D5A3D', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', backgroundColor: '#F2EBE0', fontFamily: 'Inter, sans-serif', paddingBottom: 60 }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid #E5DDD2',
        backgroundColor: 'rgba(242,235,224,0.95)',
        backdropFilter: 'blur(10px)',
        position: 'sticky', top: 0, zIndex: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => router.back()} style={{
            width: 34, height: 34, borderRadius: 10,
            backgroundColor: 'rgba(255,255,255,0.8)', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#2D5A3D', fontSize: 18, flexShrink: 0,
            boxShadow: '0 1px 6px rgba(0,0,0,0.1)',
          }}>←</button>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#1A1209', letterSpacing: '-0.02em' }}>
              Hub carousel
            </h1>
            <p style={{ margin: 0, fontSize: 11, color: '#8A7A6A' }}>
              Gestion éditoriale de la mise en avant
            </p>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#7A6A5A', cursor: 'pointer' }}>
            <input type="checkbox" checked={showExpired} onChange={e => setShowExpired(e.target.checked)} />
            Voir expirés
          </label>
        </div>
      </div>

      {error && <p style={{ padding: 16, color: '#C0392B', fontSize: 13, textAlign: 'center' }}>{error}</p>}

      <div style={{ padding: '14px 12px' }}>
        {FEATURED_SLOTS.map(slot => {
          const items = allSlots.filter(s => s.slot === slot.id)
          return (
            <section key={slot.id} style={{ marginBottom: 22 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10, padding: '0 4px' }}>
                <span style={{ fontSize: 18 }}>{slot.emoji}</span>
                <h2 style={{ margin: 0, fontSize: 14, fontWeight: 900, color: '#1A1209' }}>{slot.label}</h2>
                <span style={{ fontSize: 11, color: '#8A7A6A' }}>· {items.length} item{items.length > 1 ? 's' : ''}</span>
              </div>

              {items.length === 0 ? (
                <p style={{ padding: '14px 16px', backgroundColor: '#FDFAF6', borderRadius: 12, fontSize: 12, color: '#8A7A6A', fontStyle: 'italic', textAlign: 'center' }}>
                  Aucun contenu featured. Le hub utilise le fallback automatique.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {items.map((s, idx) => (
                    <SlotCard
                      key={s.id}
                      slot={s}
                      isFirst={idx === 0}
                      isLast={idx === items.length - 1}
                      onUp={() => bumpPriority(s, +1)}
                      onDown={() => bumpPriority(s, -1)}
                      onExtend={h => extendDuration(s, h)}
                      onDelete={() => deleteSlot(s.id)}
                    />
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

function SlotCard({
  slot, isFirst, isLast,
  onUp, onDown, onExtend, onDelete,
}: {
  slot: EnrichedSlot
  isFirst: boolean
  isLast:  boolean
  onUp:     () => void
  onDown:   () => void
  onExtend: (hours: number) => void
  onDelete: () => void
}) {
  const expired = new Date(slot.ends_at) <= new Date()
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 14,
      backgroundColor: '#fff',
      border: expired ? '1.5px solid #E5DDD2' : '1px solid #E5DDD2',
      opacity: expired ? 0.6 : 1,
      display: 'flex', gap: 10, alignItems: 'center',
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 10, flexShrink: 0,
        backgroundColor: '#F0EBE3',
        backgroundImage: slot.imageUrl ? `url(${slot.imageUrl})` : undefined,
        backgroundSize: 'cover', backgroundPosition: 'center',
      }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <Link
          href={slot.detailUrl ?? '#'}
          style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
        >
          <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#1A1209', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {slot.title ?? '(contenu)'}
          </p>
        </Link>
        <p style={{ margin: '2px 0 0', fontSize: 10, color: '#8A7A6A' }}>
          <span style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>{slot.content_type}</span>
          {' · '}
          <span style={{ color: slot.source === 'admin' ? '#2D5A3D' : slot.source === 'boost_purchase' ? '#E8622A' : '#3A5BC7' }}>
            {slot.source === 'admin' ? 'éditorial' : slot.source === 'boost_purchase' ? 'boost payant' : slot.source === 'pro_credit' ? 'crédit pro' : slot.source}
          </span>
          {' · '}
          priority {slot.priority}
          {' · '}
          {expired ? 'expiré' : `expire dans ${fmtRemaining(slot.ends_at)}`}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
        <button onClick={onUp}   disabled={isFirst} style={btnStyle(isFirst)}>▲</button>
        <button onClick={onDown} disabled={isLast}  style={btnStyle(isLast)}>▼</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
        <button onClick={() => onExtend(24)}  style={btnStyle(false)} title="+1 jour">+1j</button>
        <button onClick={onDelete} style={{ ...btnStyle(false), color: '#C0392B' }}>✕</button>
      </div>
    </div>
  )
}

function btnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 30, height: 26, borderRadius: 7,
    border: '1px solid #E5DDD2', backgroundColor: '#FDFAF6',
    color: '#2D5A3D', fontSize: 11, fontWeight: 800,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    fontFamily: 'Inter, sans-serif',
  }
}
