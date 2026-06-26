'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { SupportConversationListItem } from '@/lib/support'

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return 'à l\'instant'
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}j`
}

export default function AdminSupportList() {
  const router = useRouter()
  const { user, isAdmin, loading: authLoading } = useAuth()
  const [convs, setConvs] = useState<SupportConversationListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (!user || !isAdmin) {
      router.replace('/')
      return
    }
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return
      const res = await fetch('/api/support/conversations', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? 'Erreur')
        setLoading(false)
        return
      }
      const data = await res.json()
      setConvs(data.conversations ?? [])
      setLoading(false)
    })()
  }, [authLoading, user, isAdmin, router])

  if (authLoading || loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2EBE0' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '4px solid #E0D8CE', borderTopColor: '#2D5A3D', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', backgroundColor: '#F2EBE0', fontFamily: 'var(--font-body), sans-serif' }}>
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
            backgroundColor: 'rgba(255,255,255,0.8)',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#2D5A3D', fontSize: 18, flexShrink: 0,
            boxShadow: '0 1px 6px rgba(0,0,0,0.1)',
          }}>←</button>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#1A1209', letterSpacing: '-0.02em' }}>
              Tickets support
            </h1>
            <p style={{ margin: 0, fontSize: 11, color: '#8A7A6A' }}>
              {convs.length} ticket{convs.length > 1 ? 's' : ''} ·{' '}
              {convs.filter(c => c.unread_count > 0).length} non lu{convs.filter(c => c.unread_count > 0).length > 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Liste */}
      <div style={{ padding: '12px 12px 40px' }}>
        {error && (
          <p style={{ padding: 16, color: '#C0392B', fontSize: 13, textAlign: 'center' }}>{error}</p>
        )}

        {convs.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#8A7A6A', fontSize: 13, padding: 40 }}>
            Aucun ticket pour l&apos;instant.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {convs.map(c => {
              const last = c.last_message
              const isUnread = c.unread_count > 0
              return (
                <Link
                  key={c.id}
                  href={`/admin/support/${c.id}`}
                  style={{
                    display: 'block', textDecoration: 'none', color: 'inherit',
                    backgroundColor: '#fff',
                    border: isUnread ? '1.5px solid #2D5A3D' : '1px solid #E5DDD2',
                    borderRadius: 14,
                    padding: '12px 14px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* Avatar user */}
                    <div style={{
                      width: 38, height: 38, borderRadius: '50%',
                      backgroundColor: '#2D5A3D', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, fontWeight: 800,
                      backgroundImage: c.user?.avatar_url ? `url(${c.user.avatar_url})` : undefined,
                      backgroundSize: 'cover', backgroundPosition: 'center',
                      flexShrink: 0,
                    }}>
                      {!c.user?.avatar_url && (c.user?.display_name?.[0] || c.user?.email?.[0] || '?').toUpperCase()}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#1A1209', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                          {c.user?.display_name || c.user?.email || 'Utilisateur'}
                        </p>
                        <span style={{ fontSize: 10, color: '#8A7A6A', flexShrink: 0 }}>
                          {timeAgo(c.updated_at)}
                        </span>
                      </div>
                      {c.user?.email && c.user.display_name && (
                        <p style={{ margin: '1px 0', fontSize: 10, color: '#A89B8C', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.user.email}
                        </p>
                      )}
                      <p style={{ margin: '3px 0 0', fontSize: 12, color: isUnread ? '#1A1209' : '#7A6A5A', fontWeight: isUnread ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {last?.sender_is_admin ? '↳ ' : ''}{last?.content ?? c.subject ?? '(vide)'}
                      </p>
                    </div>

                    {isUnread && (
                      <span style={{
                        minWidth: 22, height: 22, borderRadius: 11,
                        backgroundColor: '#E53935', color: '#fff',
                        fontSize: 11, fontWeight: 800,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '0 6px', flexShrink: 0,
                      }}>{c.unread_count}</span>
                    )}

                    {c.statut === 'closed' && (
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        color: '#8A7A6A', backgroundColor: '#F0EAE0',
                        padding: '3px 8px', borderRadius: 6,
                        flexShrink: 0,
                      }}>clos</span>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
