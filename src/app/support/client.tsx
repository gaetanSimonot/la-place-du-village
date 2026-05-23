'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import BottomNavBar from '@/components/BottomNavBar'
import AppInfoModal from '@/components/AppInfoModal'
import type { SupportConversationListItem } from '@/lib/support'
import { useSmartBack } from '@/hooks/useSmartBack'

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return 'à l\'instant'
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}j`
}

export default function SupportList() {
  const { user, loading: authLoading } = useAuth()
  const { openAuthModal } = useAuthModal()
  const goBack = useSmartBack('/messages')
  const [convs, setConvs] = useState<SupportConversationListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      openAuthModal('/support')
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user])

  if (authLoading || loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2EBE0' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '4px solid #E0D8CE', borderTopColor: '#2D5A3D', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', backgroundColor: '#F2EBE0', fontFamily: 'Inter, sans-serif', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid #E5DDD2',
        backgroundColor: 'rgba(242,235,224,0.95)',
        backdropFilter: 'blur(10px)',
        position: 'sticky', top: 0, zIndex: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={goBack} style={{
            width: 34, height: 34, borderRadius: 10,
            backgroundColor: 'rgba(255,255,255,0.8)',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#2D5A3D', fontSize: 18, flexShrink: 0,
            boxShadow: '0 1px 6px rgba(0,0,0,0.1)',
          }}>←</button>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#1A1209', letterSpacing: '-0.02em' }}>
              Mes échanges support
            </h1>
            <p style={{ margin: 0, fontSize: 11, color: '#8A7A6A' }}>
              {convs.length === 0 ? 'Aucun échange pour l\'instant' : `${convs.length} ticket${convs.length > 1 ? 's' : ''}`}
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
          <div style={{ textAlign: 'center', padding: '40px 24px' }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>💬</div>
            <p style={{ fontSize: 14, color: '#1A1209', fontWeight: 700, margin: '0 0 6px' }}>
              Aucun échange pour l&apos;instant
            </p>
            <p style={{ fontSize: 12, color: '#8A7A6A', margin: '0 0 20px', lineHeight: 1.5 }}>
              Une question, un bug, une suggestion ?
              <br />Contacte l&apos;équipe — on te répond au plus vite.
            </p>
            <button
              onClick={() => setInfoOpen(true)}
              style={{
                padding: '12px 22px', borderRadius: 999,
                backgroundColor: '#2D5A3D', color: '#fff',
                border: 'none', fontSize: 13, fontWeight: 800,
                fontFamily: 'inherit', cursor: 'pointer',
              }}
            >Contacter l&apos;équipe</button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {convs.map(c => {
                const last = c.last_message
                const isUnread = c.unread_count > 0
                return (
                  <Link
                    key={c.id}
                    href={`/support/${c.id}`}
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
                      <div style={{
                        width: 38, height: 38, borderRadius: '50%',
                        backgroundColor: '#E8F2EB', color: '#2D5A3D',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 18, flexShrink: 0,
                      }}>🌿</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#1A1209', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                            Équipe La Place du Village
                          </p>
                          <span style={{ fontSize: 10, color: '#8A7A6A', flexShrink: 0 }}>
                            {timeAgo(c.updated_at)}
                          </span>
                        </div>
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

            <button
              onClick={() => setInfoOpen(true)}
              style={{
                width: '100%', padding: '14px',
                borderRadius: 14,
                backgroundColor: '#fff', border: '1.5px dashed #2D5A3D',
                color: '#2D5A3D', fontSize: 13, fontWeight: 800,
                fontFamily: 'inherit', cursor: 'pointer',
              }}
            >+ Nouveau message</button>
          </>
        )}
      </div>

      {infoOpen && <AppInfoModal onClose={() => setInfoOpen(false)} />}
      <BottomNavBar />
    </div>
  )
}
