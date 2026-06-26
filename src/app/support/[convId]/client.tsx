'use client'
import { useEffect, useRef, useState } from 'react'
import { mutate } from 'swr'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import BottomNavBar from '@/components/BottomNavBar'
import type { SupportConversation, SupportMessage } from '@/lib/support'
import { useSmartBack } from '@/hooks/useSmartBack'

interface Props {
  convId: string
  mode: 'user' | 'admin'
}

interface OtherUser {
  user_id: string
  display_name: string | null
  avatar_url: string | null
  email: string | null
}

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return 'à l\'instant'
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}j`
}

export default function SupportConversationClient({ convId, mode }: Props) {
  const { user, loading: authLoading } = useAuth()
  const { openAuthModal } = useAuthModal()
  const goBack = useSmartBack('/support')

  const [conv, setConv]         = useState<SupportConversation | null>(null)
  const [otherUser, setOther]   = useState<OtherUser | null>(null)
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [loading, setLoading]   = useState(true)
  const [text, setText]         = useState('')
  const [sending, setSending]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)

  // Auth gate
  useEffect(() => {
    if (!authLoading && !user) {
      const redirect = mode === 'admin' ? `/admin/support/${convId}` : `/support/${convId}`
      openAuthModal(redirect)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return
    const res = await fetch(`/api/support/conversations/${convId}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Conversation introuvable')
      setLoading(false)
      return
    }
    const data = await res.json()
    setConv(data.conversation)
    setMessages(data.messages ?? [])
    setOther(data.user ?? null)
    setLoading(false)
    // Le GET ci-dessus a marqué les messages de l'autre côté comme lus → on
    // revalide la boîte unifiée pour que le badge non-lu y disparaisse.
    mutate('/api/messages')
  }

  useEffect(() => {
    if (!user) return
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, convId])

  // Realtime
  useEffect(() => {
    if (!user || !convId) return
    const ch = supabase.channel(`support-conv-${convId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'support_messages',
        filter: `conversation_id=eq.${convId}`,
      }, ({ new: m }) => {
        const msg = m as SupportMessage
        setMessages(prev => prev.some(x => x.id === msg.id) ? prev : [...prev, msg])
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [user, convId])

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages.length])

  async function send() {
    if (!text.trim() || sending || !user) return
    const content = text.trim()
    setText('')
    setSending(true)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setSending(false); return }
    const res = await fetch(`/api/support/conversations/${convId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Erreur envoi')
      setText(content)
    } else {
      const d = await res.json()
      if (d.message) {
        setMessages(prev => prev.some(x => x.id === d.message.id) ? prev : [...prev, d.message])
      }
    }
    setSending(false)
  }

  if (authLoading || loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2EBE0' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '4px solid #E0D8CE', borderTopColor: '#2D5A3D', animation: 'spin 0.7s linear infinite' }} />
      </div>
    )
  }

  if (error && !conv) {
    return (
      <div style={{ minHeight: '100dvh', backgroundColor: '#F2EBE0', padding: 40, textAlign: 'center', fontFamily: 'var(--font-body), sans-serif' }}>
        <p style={{ color: '#8A7A6A' }}>{error}</p>
        <Link href={mode === 'admin' ? '/admin/support' : '/'} style={{ color: '#2D5A3D', fontWeight: 700 }}>← Retour</Link>
      </div>
    )
  }

  if (!conv) return null

  const isClosed = conv.statut === 'closed'

  // Texte du header
  const headerTitle = mode === 'admin'
    ? (otherUser?.display_name || otherUser?.email || 'Utilisateur')
    : 'Équipe La Place du Village'
  const headerSubtitle = mode === 'admin'
    ? (otherUser?.email ?? '')
    : 'Support — on te répond au plus vite'

  return (
    <div style={{
      minHeight: '100dvh',
      backgroundColor: '#F2EBE0',
      fontFamily: 'var(--font-body), sans-serif',
      display: 'flex',
      flexDirection: 'column',
      paddingBottom: mode === 'user' ? 64 : 0,
    }}>
      {/* Header sticky */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        backgroundColor: 'rgba(242,235,224,0.95)',
        backdropFilter: 'blur(10px)',
        padding: '12px 16px',
        borderBottom: '1px solid #E5DDD2',
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

          {/* Avatar */}
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            backgroundColor: '#2D5A3D', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 800,
            backgroundImage: mode === 'admin' && otherUser?.avatar_url ? `url(${otherUser.avatar_url})` : undefined,
            backgroundSize: 'cover', backgroundPosition: 'center',
            flexShrink: 0,
          }}>
            {mode === 'admin'
              ? (!otherUser?.avatar_url && (otherUser?.display_name?.[0] || otherUser?.email?.[0] || '?').toUpperCase())
              : '🌿'}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#2C1810', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {headerTitle}
            </p>
            <p style={{ margin: 0, fontSize: 11, color: '#8A7A6A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {isClosed ? '✓ Ticket clos' : headerSubtitle}
            </p>
          </div>
        </div>
      </div>

      {/* Liste messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 12px' }}>
        {messages.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#8A7A6A', fontSize: 13, padding: 40 }}>
            Aucun message.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages.map(m => {
              const mine = m.sender_id === user?.id
              return (
                <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '78%',
                    padding: '9px 13px',
                    borderRadius: 16,
                    backgroundColor: mine ? '#2D5A3D' : '#fff',
                    color: mine ? '#fff' : '#2C1810',
                    fontSize: 14,
                    lineHeight: 1.4,
                    boxShadow: mine ? 'none' : '0 1px 4px rgba(0,0,0,0.06)',
                  }}>
                    {/* En mode user, les messages admin affichent un petit tag */}
                    {!mine && mode === 'user' && m.sender_is_admin && (
                      <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 800, color: '#2D5A3D', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        🌿 Équipe
                      </p>
                    )}
                    <p style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.content}</p>
                    <p style={{ margin: '4px 0 0', fontSize: 10, color: mine ? 'rgba(255,255,255,0.7)' : '#A89B8C', textAlign: 'right' }}>
                      {timeAgo(m.created_at)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {error && (
        <p style={{
          margin: '0 12px', padding: '8px 12px', borderRadius: 10,
          backgroundColor: '#FEF2F2', color: '#C0392B',
          fontSize: 12, fontWeight: 600, textAlign: 'center',
        }}>{error}</p>
      )}

      {/* Saisie */}
      {!isClosed && (
        <div style={{ display: 'flex', gap: 8, padding: '10px 12px 12px', borderTop: '1px solid #E5DDD2', backgroundColor: '#FDFAF6' }}>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder={mode === 'admin' ? 'Répondre…' : 'Votre message…'}
            rows={1}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: 16,
              border: '1.5px solid #E8E0D5',
              fontSize: 14,
              fontFamily: 'inherit',
              outline: 'none',
              color: '#2C1810',
              backgroundColor: '#fff',
              resize: 'none',
              maxHeight: 100,
            }}
          />
          <button
            onClick={send}
            disabled={!text.trim() || sending}
            style={{
              padding: '0 18px',
              borderRadius: 16,
              border: 'none',
              backgroundColor: text.trim() && !sending ? '#2D5A3D' : '#D8D0C8',
              color: '#fff',
              fontWeight: 700,
              fontSize: 14,
              cursor: text.trim() && !sending ? 'pointer' : 'default',
            }}
          >→</button>
        </div>
      )}

      {isClosed && (
        <div style={{ padding: '14px 16px', textAlign: 'center', backgroundColor: '#E8F2EB', borderTop: '1px solid #C5DCC9' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#2D5A3D', fontWeight: 700 }}>
            ✓ Ticket clos
          </p>
        </div>
      )}

      {mode === 'user' && <BottomNavBar />}
    </div>
  )
}
