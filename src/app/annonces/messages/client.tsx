'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import BottomNavBar from '@/components/BottomNavBar'
import { useSmartBack } from '@/hooks/useSmartBack'

interface ConvItem {
  id: string
  annonce_id: string
  statut: 'open' | 'closed'
  role: 'vendeur' | 'acheteur'
  updated_at: string
  annonce: { id: string; titre: string; photos: string[]; statut: string } | null
  other: { display_name: string | null; avatar_url: string | null } | null
  last_message: { content: string; created_at: string; kind: string; sender_id: string | null } | null
  unread_count: number
}

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return 'à l\'instant'
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}j`
}

function Avatar({ name, url, size = 44 }: { name: string; url?: string | null; size?: number }) {
  if (url) return <img src={url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      backgroundColor: '#2D5A3D', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.4, flexShrink: 0,
    }}>{(name || '?')[0].toUpperCase()}</div>
  )
}

export default function MesConversationsClient() {
  const { user, loading: authLoading } = useAuth()
  const { openAuthModal } = useAuthModal()
  const goBack = useSmartBack('/messages')
  const [convs, setConvs]   = useState<ConvItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'acheteur' | 'vendeur'>('all')

  useEffect(() => {
    if (!authLoading && !user) openAuthModal('/annonces/messages')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user])

  useEffect(() => {
    if (!user) return
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) { setLoading(false); return }
      const res = await fetch('/api/annonces/mes-conversations', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const d = await res.json()
        setConvs(d.conversations ?? [])
      }
      setLoading(false)
    })()
  }, [user])

  const visible = convs.filter(c => filter === 'all' ? true : c.role === filter)

  if (authLoading || !user) {
    return (
      <div style={{ minHeight: '100dvh', backgroundColor: '#F2EBE0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', border: '4px solid #E0D8CE', borderTopColor: '#2D5A3D', animation: 'spin 0.7s linear infinite' }} />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', backgroundColor: '#F2EBE0', fontFamily: 'var(--font-body), sans-serif', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: 'rgba(242,235,224,0.92)', backdropFilter: 'blur(10px)', borderBottom: '1px solid #E5DDD2' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px' }}>
          <button onClick={goBack} style={{
            width: 34, height: 34, borderRadius: 10,
            backgroundColor: 'rgba(255,255,255,0.8)', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#2D5A3D', fontSize: 18, flexShrink: 0,
            boxShadow: '0 1px 6px rgba(0,0,0,0.1)',
          }}>←</button>
          <h1 style={{ flex: 1, margin: 0, fontSize: 18, fontWeight: 800, color: '#2C1810' }}>Mes conversations</h1>
        </div>

        {/* Filter pills */}
        <div style={{ display: 'flex', gap: 8, padding: '0 16px 12px' }}>
          {(['all', 'acheteur', 'vendeur'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '6px 14px', borderRadius: 999, border: 'none',
                fontSize: 12, fontWeight: 700,
                backgroundColor: filter === f ? '#2D5A3D' : '#fff',
                color: filter === f ? '#fff' : '#8A7A6A',
                cursor: 'pointer',
                boxShadow: filter === f ? 'none' : '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              {f === 'all' ? 'Toutes' : f === 'acheteur' ? 'Je contacte' : 'On me contacte'}
            </button>
          ))}
        </div>
      </div>

      {/* Liste */}
      <div style={{ padding: '12px 12px' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', border: '3px solid #E0D8CE', borderTopColor: '#2D5A3D', animation: 'spin 0.7s linear infinite' }} />
          </div>
        ) : visible.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <p style={{ fontSize: 32, margin: '0 0 8px' }}>💬</p>
            <p style={{ color: '#8A7A6A', margin: 0, fontSize: 14 }}>Aucune conversation pour l&apos;instant.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visible.map(c => (
              <Link
                key={c.id}
                href={`/annonces/conversations/${c.id}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: 12, borderRadius: 14,
                  backgroundColor: '#fff', boxShadow: '0 1px 6px rgba(44,28,16,0.06)',
                  textDecoration: 'none', color: 'inherit',
                }}
              >
                <Avatar name={c.other?.display_name || '?'} url={c.other?.avatar_url} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#2C1810', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {c.other?.display_name ?? 'Utilisateur'}
                    </p>
                    <span style={{
                      fontSize: 9, fontWeight: 800, color: c.role === 'vendeur' ? '#2D5A3D' : '#E8622A',
                      backgroundColor: c.role === 'vendeur' ? '#E8F2EB' : '#FFF0EB',
                      padding: '2px 7px', borderRadius: 999, letterSpacing: '0.04em', textTransform: 'uppercase', flexShrink: 0,
                    }}>{c.role === 'vendeur' ? 'Je vends' : 'J\'achète'}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: '#8A7A6A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.annonce?.titre ?? 'Annonce supprimée'}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: c.unread_count > 0 ? '#2C1810' : '#A89B8C', fontWeight: c.unread_count > 0 ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.last_message
                      ? (c.last_message.kind === 'system_contact' ? '📞 coordonnées partagées' :
                         c.last_message.kind === 'system_closed' ? '✓ vente conclue' :
                         (c.last_message.sender_id === user.id ? 'Vous : ' : '') + c.last_message.content)
                      : 'Démarrer la conversation'}
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                  <span style={{ fontSize: 10, color: '#A89B8C' }}>{timeAgo(c.updated_at)}</span>
                  {c.unread_count > 0 && (
                    <span style={{ backgroundColor: '#E53935', color: '#fff', borderRadius: 999, fontSize: 10, fontWeight: 800, padding: '1px 7px', minWidth: 18, textAlign: 'center' }}>
                      {c.unread_count}
                    </span>
                  )}
                  {c.statut === 'closed' && (
                    <span style={{ fontSize: 9, color: '#8A7A6A' }}>fermée</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <BottomNavBar />
    </div>
  )
}
