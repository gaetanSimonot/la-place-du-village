'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import BottomNavBar from '@/components/BottomNavBar'
import type { AnnonceMessage, AnnonceConversation } from '@/lib/annonces'

interface Props { convId: string }

interface AnnonceLite {
  id: string
  titre: string
  photos: string[]
  contact_tel: string | null
  contact_email: string | null
  statut: string
  user_id: string
}

interface OtherProfile {
  user_id: string
  display_name: string | null
  avatar_url: string | null
}

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return 'à l\'instant'
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}j`
}

export default function ConversationPageClient({ convId }: Props) {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { openAuthModal } = useAuthModal()

  const [conv, setConv]           = useState<AnnonceConversation | null>(null)
  const [annonce, setAnnonce]     = useState<AnnonceLite | null>(null)
  const [other, setOther]         = useState<OtherProfile | null>(null)
  const [messages, setMessages]   = useState<AnnonceMessage[]>([])
  const [loading, setLoading]     = useState(true)
  const [text, setText]           = useState('')
  const [sending, setSending]     = useState(false)
  const [action, setAction]       = useState<string | null>(null)
  const [error, setError]         = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)

  // Auth gate
  useEffect(() => {
    if (!authLoading && !user) openAuthModal(`/annonces/conversations/${convId}`)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user])

  // Load initial state
  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return
    const res = await fetch(`/api/annonces/conversations/${convId}/messages`, {
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
    setAnnonce(data.annonce)

    // Charge l'autre membre
    if (user && data.conversation) {
      const otherId = data.conversation.acheteur_id === user.id
        ? data.conversation.vendeur_id
        : data.conversation.acheteur_id
      const { data: prof } = await supabase
        .from('profiles').select('user_id, display_name, avatar_url')
        .eq('user_id', otherId).maybeSingle()
      setOther(prof as OtherProfile | null)
    }
    setLoading(false)
  }

  useEffect(() => {
    if (!user) return
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, convId])

  // Realtime : nouveau message arrive → on l'ajoute si pas déjà présent
  useEffect(() => {
    if (!user || !convId) return
    const ch = supabase.channel(`conv-${convId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'annonces_messages',
        filter: `conversation_id=eq.${convId}`,
      }, ({ new: m }) => {
        const msg = m as AnnonceMessage
        setMessages(prev => prev.some(x => x.id === msg.id) ? prev : [...prev, msg])
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [user, convId])

  // Auto-scroll en bas quand de nouveaux messages arrivent
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  async function send() {
    if (!text.trim() || sending) return
    const content = text.trim()
    setText('')
    setSending(true)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setSending(false); return }
    const res = await fetch(`/api/annonces/conversations/${convId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Erreur envoi')
      setText(content) // restaure le texte si échec
    }
    setSending(false)
  }

  async function callAction(path: string, label: string) {
    if (!confirm(label)) return
    setAction(path); setError(null)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setAction(null); return }
    const res = await fetch(`/api/annonces/conversations/${convId}/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Erreur')
    } else {
      await load()
    }
    setAction(null)
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
      <div style={{ minHeight: '100dvh', backgroundColor: '#F2EBE0', padding: 40, textAlign: 'center', fontFamily: 'Inter, sans-serif' }}>
        <p style={{ color: '#8A7A6A' }}>{error}</p>
        <Link href="/annonces" style={{ color: '#2D5A3D', fontWeight: 700 }}>← Retour aux annonces</Link>
      </div>
    )
  }

  if (!conv || !annonce) return null

  const isVendeur = user?.id === conv.vendeur_id
  const isClosed  = conv.statut === 'closed'

  // Vérifie si le contact a déjà été partagé
  const contactShared = messages.some(m => m.kind === 'system_contact')

  return (
    <div style={{
      minHeight: '100dvh',
      backgroundColor: '#F2EBE0',
      fontFamily: 'Inter, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      paddingBottom: 64, // espace pour BottomNavBar
    }}>
      {/* Header sticky avec back + annonce */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        backgroundColor: 'rgba(242,235,224,0.95)',
        backdropFilter: 'blur(10px)',
        padding: '12px 16px',
        borderBottom: '1px solid #E5DDD2',
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

          <Link href={`/annonces/${annonce.id}`} style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 10,
            textDecoration: 'none', color: 'inherit', minWidth: 0,
          }}>
            {annonce.photos[0] && (
              <img src={annonce.photos[0]} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#2C1810', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {annonce.titre}
              </p>
              <p style={{ margin: 0, fontSize: 11, color: '#8A7A6A' }}>
                {isVendeur ? `avec ${other?.display_name ?? 'Acheteur'}` : `avec ${other?.display_name ?? 'Vendeur'}`}
                {isClosed && ' · vente conclue'}
              </p>
            </div>
          </Link>
        </div>
      </div>

      {/* Liste messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 12px' }}>
        {messages.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#8A7A6A', fontSize: 13, padding: 40 }}>
            {isVendeur ? 'Aucun message pour l\'instant.' : 'Envoyez un premier message au vendeur.'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages.map(m => {
              if (m.kind === 'system_contact') {
                return <SystemContactBubble key={m.id} content={m.content} timestamp={m.created_at} />
              }
              if (m.kind === 'system_closed') {
                return <SystemClosedBubble key={m.id} content={m.content} timestamp={m.created_at} />
              }
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

      {/* Erreur inline */}
      {error && (
        <p style={{
          margin: '0 12px', padding: '8px 12px', borderRadius: 10,
          backgroundColor: '#FEF2F2', color: '#C0392B',
          fontSize: 12, fontWeight: 600, textAlign: 'center',
        }}>{error}</p>
      )}

      {/* Actions bar */}
      {!isClosed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px 12px', borderTop: '1px solid #E5DDD2', backgroundColor: '#FDFAF6' }}>
          {/* Boutons d'action */}
          <div style={{ display: 'flex', gap: 8 }}>
            {isVendeur && !contactShared && (
              <button
                onClick={() => callAction('partager-contact', 'Partager vos coordonnées (tel/email) avec l\'acheteur ?')}
                disabled={action === 'partager-contact'}
                style={actionButtonStyle}
              >
                📞 Partager mes coordonnées
              </button>
            )}
            <button
              onClick={() => callAction('cloturer', 'Confirmer que la vente est conclue ? L\'annonce sera marquée comme vendue.')}
              disabled={action === 'cloturer'}
              style={{ ...actionButtonStyle, backgroundColor: '#2D5A3D', color: '#fff', borderColor: '#2D5A3D' }}
            >
              ✓ Conclure la vente
            </button>
          </div>

          {/* Saisie */}
          <div style={{ display: 'flex', gap: 8 }}>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder="Votre message…"
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
        </div>
      )}

      {isClosed && (
        <div style={{ padding: '14px 16px', textAlign: 'center', backgroundColor: '#E8F2EB', borderTop: '1px solid #C5DCC9' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#2D5A3D', fontWeight: 700 }}>
            ✓ Vente conclue — conversation fermée
          </p>
        </div>
      )}

      <BottomNavBar />
    </div>
  )
}

const actionButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: '9px 12px',
  borderRadius: 12,
  border: '1.5px solid #2D5A3D',
  backgroundColor: '#fff',
  color: '#2D5A3D',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

function SystemContactBubble({ content, timestamp }: { content: string; timestamp: string }) {
  // Parse "tel:XXX\nemail:YYY"
  const tel   = content.split('\n').find(l => l.startsWith('tel:'))?.replace('tel:', '')
  const email = content.split('\n').find(l => l.startsWith('email:'))?.replace('email:', '')
  return (
    <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
      <div style={{
        maxWidth: '90%',
        padding: '12px 16px',
        borderRadius: 14,
        backgroundColor: '#E8F2EB',
        border: '1px solid #C5DCC9',
        fontSize: 13,
        color: '#2D5A3D',
      }}>
        <p style={{ margin: '0 0 8px', fontWeight: 800, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          📞 Coordonnées du vendeur
        </p>
        {tel && (
          <a href={`tel:${tel}`} style={{ display: 'block', color: '#2D5A3D', fontWeight: 700, textDecoration: 'none', padding: '3px 0' }}>
            📞 {tel}
          </a>
        )}
        {email && (
          <a href={`mailto:${email}`} style={{ display: 'block', color: '#2D5A3D', fontWeight: 700, textDecoration: 'none', padding: '3px 0' }}>
            ✉ {email}
          </a>
        )}
        <p style={{ margin: '6px 0 0', fontSize: 10, color: '#7B8E80', textAlign: 'right' }}>{timeAgo(timestamp)}</p>
      </div>
    </div>
  )
}

function SystemClosedBubble({ content, timestamp }: { content: string; timestamp: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
      <div style={{
        padding: '8px 14px',
        borderRadius: 12,
        backgroundColor: '#FFF',
        border: '1px solid #E5DDD2',
        fontSize: 12,
        color: '#8A7A6A',
        fontStyle: 'italic',
      }}>
        ✓ {content} <span style={{ marginLeft: 4 }}>· {timeAgo(timestamp)}</span>
      </div>
    </div>
  )
}
