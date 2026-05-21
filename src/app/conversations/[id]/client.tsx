'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'

interface Message {
  id:              string
  conversation_id: string
  sender_id:       string
  content:         string
  created_at:      string
}

interface Props {
  convId: string
}

export default function ConversationClient({ convId }: Props) {
  const { user, loading: authLoading } = useAuth()
  const { openAuthModal } = useAuthModal()
  const [messages, setMessages]     = useState<Message[]>([])
  const [loading, setLoading]       = useState(true)
  const [text, setText]             = useState('')
  const [sending, setSending]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [accessDenied, setAccessDenied] = useState(false)
  const [canWrite, setCanWrite]     = useState(true)
  const [other, setOther]           = useState<{ display_name: string | null; avatar_url: string | null } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) openAuthModal(`/conversations/${convId}`)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user])

  // Load messages + autre membre + mark read
  const load = useCallback(async () => {
    if (!user) return
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setLoading(false); return }

    const res = await fetch(`/api/conversations/${convId}/messages`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.status === 403) {
      setAccessDenied(true)
      setLoading(false)
      return
    }
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error || 'Erreur de chargement')
      setLoading(false)
      return
    }
    const data = await res.json()
    setMessages((data.messages ?? []) as Message[])
    setCanWrite(data.canWrite !== false)
    setLoading(false)

    // Marque comme lu
    fetch(`/api/conversations/${convId}/read`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {})

    // Récupère le profil de l'autre membre (depuis /api/conversations qui enrichit)
    fetch('/api/conversations', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        const conv = (d.conversations ?? []).find((c: { id: string; other_member?: { display_name: string | null; avatar_url: string | null } | null }) => c.id === convId)
        if (conv?.other_member) setOther(conv.other_member)
      })
      .catch(() => {})
  }, [user, convId])

  useEffect(() => { load() }, [load])

  // ── Realtime (channel scopé à la conv + cleanup au unmount) ──────────────
  useEffect(() => {
    if (!user || !convId) return
    const ch = supabase.channel(`conv-unified-${convId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `conversation_id=eq.${convId}`,
      }, ({ new: m }) => {
        const msg = m as Message
        setMessages(prev => prev.some(x => x.id === msg.id) ? prev : [...prev, msg])
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [user, convId])

  // Auto-scroll en bas à chaque nouveau message
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages.length])

  // Envoi message
  async function send(e: React.FormEvent) {
    e.preventDefault()
    const content = text.trim()
    if (!content || sending) return
    setSending(true); setError(null)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setSending(false); return }
    const res = await fetch(`/api/conversations/${convId}/messages`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ content }),
    })
    if (res.ok) {
      setText('')
      const data = await res.json()
      if (data?.message) {
        setMessages(prev => prev.some(x => x.id === data.message.id) ? prev : [...prev, data.message])
      }
    } else {
      const d = await res.json().catch(() => ({}))
      setError(d.error || 'Erreur d\'envoi')
    }
    setSending(false)
  }

  if (authLoading) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-creme">
        <div style={{ width: 28, height: 28, borderRadius: '50%', border: '4px solid #E0D8CE', borderTopColor: '#2D5A3D', animation: 'spin 0.7s linear infinite' }} />
      </main>
    )
  }
  if (!user) {
    return (
      <main className="min-h-[100dvh] bg-creme p-8 text-center font-inter">
        <p className="text-[14px] text-texte-doux">Connecte-toi pour voir cette conversation.</p>
      </main>
    )
  }

  // ── Accès refusé (URL d'une conv qui n'est pas la mienne) ──────────────
  if (accessDenied) {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-creme px-6 text-center font-inter">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-cremeDeep text-texte-doux">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <h1 className="m-0 mb-1 font-serif text-[20px] text-texte" style={{ letterSpacing: '-0.01em' }}>
          Conversation inaccessible
        </h1>
        <p className="m-0 mb-5 max-w-[320px] text-[13px] text-texte-doux">
          Tu n&apos;es pas membre de cette conversation.
        </p>
        <Link
          href="/messages"
          className="rounded-xl bg-primary px-4 py-2.5 text-[13px] font-bold text-white no-underline"
        >
          Retour aux messages
        </Link>
      </main>
    )
  }

  const initial = (other?.display_name || '?')[0]?.toUpperCase() ?? '?'

  return (
    <main className="flex min-h-[100dvh] flex-col bg-creme font-inter text-texte">
      {/* ─── Top bar ─────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 flex items-center gap-2.5 border-b border-bordSoft bg-creme/95 px-4 py-3 backdrop-blur">
        <Link
          href="/messages"
          aria-label="Retour aux messages"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-bord bg-white text-texte"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </Link>
        {other?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={other.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-[14px] font-bold text-white">
            {initial}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-serif text-[15px] leading-none text-texte" style={{ letterSpacing: '-0.01em' }}>
            {other?.display_name ?? 'Conversation'}
          </div>
          <div className="mt-0.5 text-[10.5px] font-medium text-texte-doux">
            Ami
          </div>
        </div>
      </div>

      {/* ─── Messages (scroll) ──────────────────────────────── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3" style={{ minHeight: 0 }}>
        {loading && messages.length === 0 && (
          <p className="py-6 text-center text-[12px] text-texte-doux">Chargement…</p>
        )}
        {!loading && messages.length === 0 && (
          <div className="rounded-2xl border border-bordSoft bg-white p-6 text-center">
            <p className="m-0 mb-1 text-[14px] font-bold text-texte">Pas encore de message</p>
            <p className="m-0 text-[12px] text-texte-doux">Envoie le premier mot.</p>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          {messages.map(m => {
            const mine = m.sender_id === user.id
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[78%] rounded-2xl px-3 py-2 text-[13.5px] ${
                    mine
                      ? 'bg-primary text-white'
                      : 'border border-bord bg-white text-texte'
                  }`}
                  style={{ wordBreak: 'break-word' }}
                >
                  {m.content}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ─── Composer (caché si plus amis = conv figée) ───── */}
      {canWrite ? (
        <form onSubmit={send} className="sticky bottom-0 z-30 flex items-center gap-2 border-t border-bordSoft bg-creme/95 px-3 py-2.5 backdrop-blur" style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom, 10px))' }}>
          <input
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Écris un message…"
            disabled={sending}
            className="min-w-0 flex-1 rounded-full border border-bord bg-white px-4 py-2.5 text-[14px] text-texte outline-none placeholder:text-texte-tres-doux disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!text.trim() || sending}
            aria-label="Envoyer"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white disabled:opacity-50"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </form>
      ) : (
        <div className="sticky bottom-0 z-30 border-t border-bordSoft bg-cremeDeep/80 px-4 py-3 text-center backdrop-blur" style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom, 14px))' }}>
          <p className="m-0 text-[12px] font-medium text-texte-doux">
            Vous n&apos;êtes plus amis. Reprenez l&apos;amitié pour pouvoir discuter à nouveau.
          </p>
        </div>
      )}

      {error && (
        <div className="px-4 pb-2 text-center text-[11px] text-accent">{error}</div>
      )}
    </main>
  )
}
