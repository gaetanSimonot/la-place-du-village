'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { mutate } from 'swr'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import BottomNavBar, { NAV_H } from '@/components/BottomNavBar'
import type { Covoiturage, CovoitConversation, CovoitMessage } from '@/lib/covoiturage'

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return "à l'instant"
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}j`
}

export default function CovoitConversationClient({ convId }: { convId: string }) {
  const { user, loading: authLoading } = useAuth()
  const { openAuthModal } = useAuthModal()

  const [conv, setConv]         = useState<CovoitConversation | null>(null)
  const [covoit, setCovoit]     = useState<Covoiturage | null>(null)
  const [messages, setMessages] = useState<CovoitMessage[]>([])
  const [loading, setLoading]   = useState(true)
  const [text, setText]         = useState('')
  const [sending, setSending]   = useState(false)
  const [acting, setActing]     = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!authLoading && !user) openAuthModal(`/covoiturage/conversations/${convId}`)
  }, [authLoading, user, openAuthModal, convId])

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return
    const res = await fetch(`/api/covoiturages/conversations/${convId}/messages`, {
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
    setCovoit(data.covoiturage)
    setMessages(data.messages ?? [])
    setLoading(false)
    // Le GET ci-dessus a marqué les messages de l'autre comme lus → revalide la
    // boîte unifiée pour que le badge non-lu disparaisse (liste + icône messagerie).
    mutate('/api/messages')
  }, [convId])

  useEffect(() => { if (user) load() }, [load, user])

  // Realtime sur les nouveaux messages
  useEffect(() => {
    if (!user) return
    const ch = supabase
      .channel(`covoit-msg-${convId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'covoit_messages', filter: `conversation_id=eq.${convId}` },
        () => load(),
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'covoit_conversations', filter: `id=eq.${convId}` },
        () => load(),
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [convId, user, load])

  // Scroll en bas à chaque nouveau message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    const content = text.trim()
    if (!content || sending) return
    setSending(true); setError(null)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    const res = await fetch(`/api/covoiturages/conversations/${convId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ content }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setError(d.error ?? 'Erreur'); setSending(false); return }
    setText('')
    setSending(false)
    load()
  }

  const updateStatut = async (statut: 'validee' | 'refusee' | 'closed') => {
    if (acting) return
    const label = statut === 'validee' ? 'valider la place' : statut === 'refusee' ? 'refuser' : 'fermer'
    if (!confirm(`Voulez-vous ${label} ?`)) return
    setActing(true)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    const res = await fetch(`/api/covoiturages/conversations/${convId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ statut }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Erreur')
    }
    setActing(false)
    load()
  }

  if (loading) {
    return <main className="min-h-[100dvh] bg-creme p-6 font-inter"><p className="text-texte-doux">Chargement…</p></main>
  }
  if (!conv || !covoit) {
    return (
      <main className="min-h-[100dvh] bg-creme p-6 font-inter">
        <p className="text-accent">{error ?? 'Conversation introuvable'}</p>
        <Link href="/covoiturage" className="mt-2 inline-block text-[12px] text-primary">← Retour</Link>
      </main>
    )
  }

  const isConducteur = user?.id === conv.conducteur_id
  const closed = conv.statut === 'closed' || conv.statut === 'refusee'

  return (
    <main
      className="flex flex-col bg-creme font-inter text-texte"
      style={{ height: `calc(100dvh - ${NAV_H}px - env(safe-area-inset-bottom, 0px))` }}
    >
      {/* Top bar */}
      <div className="sticky top-0 z-30 flex items-center gap-2.5 border-b border-bordSoft bg-creme/95 px-4 py-3 backdrop-blur">
        <Link
          href="/covoiturage/mes-conversations"
          aria-label="Retour"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-bord bg-white text-texte"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
          </svg>
        </Link>
        <Link href={`/covoiturage/${covoit.id}`} className="min-w-0 flex-1 no-underline">
          <div className="truncate text-[14px] font-bold leading-tight text-texte">
            {covoit.depart} → {covoit.destination}
          </div>
          <div className="truncate text-[11px] text-texte-doux">
            {covoit.date_trajet}{covoit.heure_depart && ` · ${covoit.heure_depart}`}
            {' · '}
            <span className={
              conv.statut === 'validee' ? 'font-bold text-primary' :
              conv.statut === 'refusee' ? 'font-bold text-accent' :
              conv.statut === 'closed'  ? 'font-bold text-texte-doux' :
                                           'font-bold text-texte-doux'
            }>
              {conv.statut === 'validee' ? '✓ Place validée' :
               conv.statut === 'refusee' ? 'Refusé' :
               conv.statut === 'closed'  ? 'Fermée' :
                                            'En discussion'}
            </span>
          </div>
        </Link>
      </div>

      {/* Conducteur actions */}
      {isConducteur && conv.statut === 'open' && (
        <div className="border-b border-bordSoft bg-white px-4 py-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => updateStatut('validee')}
              disabled={acting}
              className="flex-1 rounded-xl bg-primary py-2.5 text-[12px] font-bold text-white disabled:opacity-55"
            >
              ✓ Valider la place
            </button>
            <button
              type="button"
              onClick={() => updateStatut('refusee')}
              disabled={acting}
              className="flex-1 rounded-xl border border-accent bg-white py-2.5 text-[12px] font-bold text-accent disabled:opacity-55"
            >
              Refuser
            </button>
          </div>
        </div>
      )}

      {isConducteur && conv.statut === 'validee' && (
        <div className="border-b border-bordSoft bg-[#E8F2EB] px-4 py-2.5">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="font-bold text-primary">✓ Place validée. Partagez vos coordonnées.</span>
            <button
              type="button"
              onClick={() => updateStatut('closed')}
              disabled={acting}
              className="text-[11px] font-bold text-texte-doux underline"
            >
              Clôturer
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3"
      >
        {messages.length === 0 && (
          <p className="text-center text-[12px] text-texte-doux">Démarrez la conversation.</p>
        )}
        <div className="flex flex-col gap-2">
          {messages.map(m => {
            if (m.kind === 'system') {
              return (
                <div
                  key={m.id}
                  className="self-center rounded-full bg-cremeDeep px-3 py-1 text-center text-[11px] text-texte-doux"
                  style={{ maxWidth: '90%' }}
                >
                  {m.content}
                </div>
              )
            }
            const mine = m.sender_id === user?.id
            return (
              <div
                key={m.id}
                className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
              >
                <div
                  className="max-w-[80%] rounded-2xl px-3 py-2 text-[13px] leading-[1.4]"
                  style={{
                    background: mine ? '#2D5A3D' : '#fff',
                    color:      mine ? '#fff'    : '#1A1209',
                    border:     mine ? 'none'    : '1px solid #F0EAE0',
                    borderTopRightRadius: mine ? 4 : 16,
                    borderTopLeftRadius:  mine ? 16 : 4,
                  }}
                >
                  <p className="m-0 whitespace-pre-wrap break-words">{m.content}</p>
                </div>
                <span className="mt-0.5 text-[9.5px] text-texte-tres-doux">{timeAgo(m.created_at)}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Input */}
      {closed ? (
        <div className="border-t border-bordSoft bg-white p-3.5 text-center text-[12px] text-texte-doux">
          Cette conversation est fermée.
        </div>
      ) : (
        <form
          onSubmit={sendMessage}
          className="shrink-0 border-t border-bordSoft bg-white p-3.5"
        >
          <div className="flex items-end gap-2">
            <textarea
              value={text}
              onChange={e => setText(e.target.value.slice(0, 2000))}
              placeholder="Votre message…"
              rows={1}
              className="block max-h-[120px] min-h-[40px] flex-1 resize-none rounded-xl border border-bord bg-white px-3 py-2 text-[14px] text-texte outline-none focus:border-primary"
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage(e as unknown as React.FormEvent)
                }
              }}
            />
            <button
              type="submit"
              disabled={sending || !text.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-white disabled:opacity-55"
              aria-label="Envoyer"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
          {error && <p className="mt-2 text-[11px] text-accent">{error}</p>}
        </form>
      )}

      <BottomNavBar />
    </main>
  )
}
