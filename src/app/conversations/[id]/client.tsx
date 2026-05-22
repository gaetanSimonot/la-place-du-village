'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import BottomNavBar from '@/components/BottomNavBar'
import EmbedPicker, { type EmbedItem } from '@/components/EmbedPicker'

interface Message {
  id:              string  // 'temp_xxx' tant que pas confirmé serveur
  conversation_id: string
  sender_id:       string
  content:         string
  embed_kind:      string | null
  embed_ref_id:    string | null
  created_at:      string
  /** Optimistic UI : 'sending' = en cours d'envoi (POST en vol),
   *  'failed' = POST a échoué (réseau, validation, 403, etc.), undef = confirmé. */
  status?:         'sending' | 'failed'
}

/** Match un temp message avec le vrai message qui revient via Realtime ou POST.
 *  On compare sender + content + embed_ref_id : pas d'ID puisque le temp n'a pas
 *  encore le vrai. Pour 2 messages identiques envoyés successivement, l'ordre
 *  d'insertion est préservé (findIndex prend le premier). */
function matchesTemp(temp: Message, real: { sender_id: string; content: string; embed_ref_id: string | null }): boolean {
  return temp.id.startsWith('temp_')
    && real.sender_id === temp.sender_id
    && real.content    === temp.content
    && (real.embed_ref_id ?? null) === (temp.embed_ref_id ?? null)
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
  // Plus de state `sending` global : chaque message a son propre status
  // (sending/failed/undef). Permet d'enchaîner plusieurs envois sans bloquer
  // le composer.
  const [error, setError]           = useState<string | null>(null)
  const [accessDenied, setAccessDenied] = useState(false)
  const [canWrite, setCanWrite]     = useState(true)
  const [other, setOther]           = useState<{ display_name: string | null; avatar_url: string | null } | null>(null)
  const [embed, setEmbed]           = useState<EmbedItem | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
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
        setMessages(prev => {
          // Déjà présent par vrai ID (cas : POST response l'a inséré avant Realtime)
          if (prev.some(x => x.id === msg.id)) return prev
          // Mon propre message qui revient via Realtime — match temp et remplace
          if (msg.sender_id === user.id) {
            const idx = prev.findIndex(x => matchesTemp(x, msg))
            if (idx >= 0) {
              const copy = [...prev]
              copy[idx] = msg
              return copy
            }
          }
          return [...prev, msg]
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [user, convId])

  // Auto-scroll en bas à chaque nouveau message. RAF + double pour s'assurer
  // que le layout du nouveau msg est calculé AVANT de scroller (sinon scrollHeight
  // ne reflète pas encore la nouvelle bubble → message coincé sous le composer).
  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
      })
    })
  }, [messages.length])

  // Envoi optimistic d'un payload (content + embed). Affiche le message
  // instantanément en 'sending' AVANT la réponse serveur. Au succès, remplace
  // le temp par le vrai message (avec gestion de la race condition Realtime).
  // À l'échec, marque le temp 'failed' avec bouton réessayer.
  // Note : pas de blocage par `sending` global → l'user peut enchaîner plusieurs
  // messages, chacun pending indépendamment (UX type Messenger/WhatsApp).
  async function postMessage(payload: {
    tempId: string
    content: string
    embedKind: string | null
    embedRefId: string | null
  }) {
    if (!user) return
    setError(null)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) {
      setMessages(prev => prev.map(m => m.id === payload.tempId ? { ...m, status: 'failed' } : m))
      return
    }
    try {
      const res = await fetch(`/api/conversations/${convId}/messages`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({
          content:      payload.content,
          embed_kind:   payload.embedKind,
          embed_ref_id: payload.embedRefId,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        const realMsg = data?.message as Message | undefined
        if (!realMsg) {
          setMessages(prev => prev.map(m => m.id === payload.tempId ? { ...m, status: 'failed' } : m))
          return
        }
        // Race possible : Realtime peut être arrivé AVANT cette réponse POST
        // → si le vrai msg est déjà dans le state (via Realtime match), on retire
        // juste le temp pour éviter le doublon. Sinon on remplace le temp par real.
        setMessages(prev => {
          if (prev.some(x => x.id === realMsg.id)) {
            return prev.filter(x => x.id !== payload.tempId)
          }
          return prev.map(x => x.id === payload.tempId ? realMsg : x)
        })
      } else {
        const d = await res.json().catch(() => ({}))
        setMessages(prev => prev.map(m => m.id === payload.tempId ? { ...m, status: 'failed' } : m))
        if (d.code === 'not_friends') setError(d.error)
      }
    } catch {
      setMessages(prev => prev.map(m => m.id === payload.tempId ? { ...m, status: 'failed' } : m))
    }
  }

  // Envoi nouveau message depuis le composer
  function send(e: React.FormEvent) {
    e.preventDefault()
    const content = text.trim()
    if (!content && !embed) return
    if (!user) return

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const tempMsg: Message = {
      id:              tempId,
      conversation_id: convId,
      sender_id:       user.id,
      content,
      embed_kind:      embed?.kind ?? null,
      embed_ref_id:    embed?.id ?? null,
      created_at:      new Date().toISOString(),
      status:          'sending',
    }

    // Affichage instantané + vide le composer
    setMessages(prev => [...prev, tempMsg])
    setText('')
    setEmbed(null)

    // Fire-and-forget — la résolution met à jour le status du temp
    postMessage({
      tempId,
      content,
      embedKind:   embed?.kind ?? null,
      embedRefId:  embed?.id ?? null,
    })
  }

  // Réessayer un message en échec (relance le POST avec le même contenu)
  function retry(failed: Message) {
    setMessages(prev => prev.map(m => m.id === failed.id ? { ...m, status: 'sending' } : m))
    postMessage({
      tempId:     failed.id,
      content:    failed.content,
      embedKind:  failed.embed_kind,
      embedRefId: failed.embed_ref_id,
    })
  }

  // Retirer un message en échec définitivement (bouton secondaire)
  function discardFailed(failed: Message) {
    setMessages(prev => prev.filter(m => m.id !== failed.id))
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
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3" style={{ minHeight: 0, paddingBottom: 8 }}>
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
          {messages.map((m, i) => {
            const mine = m.sender_id === user.id
            const isPending = m.status === 'sending'
            const isFailed  = m.status === 'failed'
            // Confirmé serveur = pas pending et pas failed
            const isConfirmed = !isPending && !isFailed

            // Séparateur de jour : si le msg précédent est d'un autre jour
            const prev = i > 0 ? messages[i - 1] : null
            const showDateSep = !prev || !sameDay(prev.created_at, m.created_at)

            const hasContent = !!m.content
            const hasEmbed   = !!(m.embed_kind && m.embed_ref_id)
            // Si juste un embed sans texte → la tuile EST le message (pas de bubble verte)
            const embedOnly  = hasEmbed && !hasContent

            return (
              <div key={m.id}>
                {showDateSep && <DateSeparator iso={m.created_at} />}
                <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`flex max-w-[78%] flex-col ${mine ? 'items-end' : 'items-start'} gap-0.5`}>
                    {embedOnly ? (
                      <div style={{ opacity: isFailed ? 0.8 : 1 }}>
                        <MessageEmbedRender kind={m.embed_kind!} refId={m.embed_ref_id!} mine={mine} />
                      </div>
                    ) : (
                      <div
                        className={`rounded-2xl px-3 py-2 text-[13.5px] ${
                          mine
                            ? 'bg-primary text-white'
                            : 'border border-bord bg-white text-texte'
                        }`}
                        style={{
                          wordBreak: 'break-word',
                          opacity:   isFailed ? 0.8 : 1,
                        }}
                      >
                        {hasContent && <div>{m.content}</div>}
                        {hasEmbed && (
                          <div className={hasContent ? 'mt-1.5' : ''}>
                            <MessageEmbedRender kind={m.embed_kind!} refId={m.embed_ref_id!} mine={mine} />
                          </div>
                        )}
                      </div>
                    )}
                    {/* Heure dessous : seulement quand confirmé serveur (pas pending) */}
                    {isConfirmed && (
                      <span className="text-[10px] text-texte-tres-doux">
                        {formatTime(m.created_at)}
                      </span>
                    )}
                    {isFailed && (
                      <div className="flex items-center gap-2 text-[10.5px] font-medium text-accent">
                        <span>Échec d&apos;envoi</span>
                        <button
                          type="button"
                          onClick={() => retry(m)}
                          className="rounded-full bg-accent px-2.5 py-1 text-[10.5px] font-extrabold text-white"
                        >
                          Réessayer
                        </button>
                        <button
                          type="button"
                          onClick={() => discardFailed(m)}
                          className="rounded-full bg-transparent px-1 text-[10.5px] font-bold text-texte-doux underline"
                        >
                          Retirer
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ─── Composer (caché si plus amis = conv figée) ───── */}
      {canWrite ? (
        <div className="sticky z-30 border-t border-bordSoft bg-creme/95 backdrop-blur" style={{ bottom: 64, paddingBottom: 10 }}>
          {/* Preview embed sélectionné, au-dessus du champ */}
          {embed && (
            <div className="px-3 pt-2">
              <ChatEmbedPreview embed={embed} onRemove={() => setEmbed(null)} />
            </div>
          )}
          <form onSubmit={send} className="flex items-center gap-2 px-3 py-2.5">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              aria-label="Lier un élément du village"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cremeDeep text-primary"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <input
              type="text"
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Écris un message…"
              className="min-w-0 flex-1 rounded-full border border-bord bg-white px-4 py-2.5 text-[14px] text-texte outline-none placeholder:text-texte-tres-doux"
            />
            <button
              type="submit"
              disabled={!text.trim() && !embed}
              aria-label="Envoyer"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white disabled:opacity-50"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </form>
        </div>
      ) : (
        <div className="sticky z-30 border-t border-bordSoft bg-cremeDeep/80 px-4 py-3 text-center backdrop-blur" style={{ bottom: 64, paddingBottom: 14 }}>
          <p className="m-0 text-[12px] font-medium text-texte-doux">
            Vous n&apos;êtes plus amis. Reprenez l&apos;amitié pour pouvoir discuter à nouveau.
          </p>
        </div>
      )}

      {error && (
        <div className="px-4 pb-2 text-center text-[11px] text-accent">{error}</div>
      )}

      {pickerOpen && (
        <EmbedPicker
          onSelect={item => { setEmbed(item); setPickerOpen(false) }}
          onClose={() => setPickerOpen(false)}
        />
      )}

      <BottomNavBar />
    </main>
  )
}

/* ── Preview embed inline au-dessus du champ message ─────────────────── */
/* ── Date helpers : sameDay + formatTime + DateSeparator WhatsApp-like ── */

function sameDay(isoA: string, isoB: string): boolean {
  const a = new Date(isoA), b = new Date(isoB)
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate()  === b.getDate()
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  } catch { return '' }
}

function formatDateSeparator(iso: string): string {
  const d = new Date(iso)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
  const ref = new Date(d); ref.setHours(0, 0, 0, 0)

  if (ref.getTime() === today.getTime())     return "Aujourd'hui"
  if (ref.getTime() === yesterday.getTime()) return 'Hier'

  // Moins d'une semaine en arrière : jour + date
  const diffDays = Math.round((today.getTime() - ref.getTime()) / 86400000)
  if (diffDays > 0 && diffDays < 7) {
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  }
  // Même année : jour + mois sans année
  if (d.getFullYear() === today.getFullYear()) {
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
  }
  // Année différente : avec année
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function DateSeparator({ iso }: { iso: string }) {
  return (
    <div className="flex justify-center py-2.5">
      <span
        className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase text-texte-doux"
        style={{
          background: 'rgba(255,255,255,0.85)',
          border: '1px solid rgba(232,224,212,0.7)',
          letterSpacing: '0.06em',
          backdropFilter: 'blur(4px)',
        }}
      >
        {formatDateSeparator(iso)}
      </span>
    </div>
  )
}

function ChatEmbedPreview({ embed, onRemove }: { embed: EmbedItem; onRemove: () => void }) {
  const labels: Record<EmbedItem['kind'], string> = {
    event: 'Événement', etab: 'Établissement', producer: 'Producteur',
    annonce: 'Annonce', promo: 'Promotion', covoit: 'Covoiturage',
  }
  return (
    <div
      className="flex items-center gap-2 rounded-[12px] border bg-white px-2 py-1.5"
      style={{ borderColor: '#E8E0D4' }}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[7px] bg-primary-light text-primary">
        {embed.photo
          ? <img src={embed.photo} alt="" className="h-full w-full object-cover" />
          : <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/></svg>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[9px] font-extrabold uppercase text-primary" style={{ letterSpacing: '0.06em' }}>
          {labels[embed.kind]}
        </div>
        <div className="truncate text-[12px] font-bold text-texte">{embed.title}</div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Retirer"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cremeDeep text-texte-doux"
      >
        <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}

/* ── Render d'un embed dans une bubble message ───────────────────────── */
function MessageEmbedRender({ kind, refId, mine }: { kind: string; refId: string; mine: boolean }) {
  const [details, setDetails] = useState<{ title: string; subtitle: string | null; photo: string | null; href: string } | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (kind === 'event') {
          const { data } = await supabase.from('evenements').select('id, titre, image_url, lieux(commune)').eq('id', refId).maybeSingle()
          if (!data) { if (!cancelled) setNotFound(true); return }
          const lieuRaw = (data as { lieux?: { commune?: string | null } | { commune?: string | null }[] | null }).lieux
          const lieu = Array.isArray(lieuRaw) ? lieuRaw[0] : lieuRaw
          if (!cancelled) setDetails({ title: data.titre as string, subtitle: lieu?.commune ?? null, photo: (data.image_url as string | null) ?? null, href: `/evenement/${refId}` })
        } else if (kind === 'etab') {
          const { data } = await supabase.from('etablissements').select('nom, commune, photos').eq('id', refId).maybeSingle()
          if (!data) { if (!cancelled) setNotFound(true); return }
          if (!cancelled) setDetails({ title: data.nom as string, subtitle: (data.commune as string | null) ?? null, photo: ((data.photos as string[] | null) ?? [])[0] ?? null, href: `/etablissement/${refId}` })
        } else if (kind === 'producer') {
          const { data } = await supabase.from('producers').select('nom, commune, photos').eq('id', refId).maybeSingle()
          if (!data) { if (!cancelled) setNotFound(true); return }
          if (!cancelled) setDetails({ title: data.nom as string, subtitle: (data.commune as string | null) ?? null, photo: ((data.photos as string[] | null) ?? [])[0] ?? null, href: `/producteur/${refId}` })
        } else if (kind === 'annonce') {
          const { data } = await supabase.from('annonces').select('titre, photos, type').eq('id', refId).maybeSingle()
          if (!data) { if (!cancelled) setNotFound(true); return }
          if (!cancelled) setDetails({ title: data.titre as string, subtitle: (data.type as string | null) ?? null, photo: ((data.photos as string[] | null) ?? [])[0] ?? null, href: `/annonces/${refId}` })
        } else if (kind === 'promo') {
          const { data } = await supabase.from('promotions').select('titre, image_url').eq('id', refId).maybeSingle()
          if (!data) { if (!cancelled) setNotFound(true); return }
          if (!cancelled) setDetails({ title: data.titre as string, subtitle: null, photo: (data.image_url as string | null) ?? null, href: `/promotions` })
        } else if (kind === 'covoit') {
          const { data } = await supabase.from('covoit_trajets').select('ville_depart, ville_arrivee, date_depart').eq('id', refId).maybeSingle()
          if (!data) { if (!cancelled) setNotFound(true); return }
          const sub = data.date_depart ? new Date(data.date_depart as string).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : null
          if (!cancelled) setDetails({ title: `${data.ville_depart} → ${data.ville_arrivee}`, subtitle: sub, photo: null, href: `/covoiturage/${refId}` })
        }
      } catch {
        if (!cancelled) setNotFound(true)
      }
    })()
    return () => { cancelled = true }
  }, [kind, refId])

  const labels: Record<string, string> = {
    event: 'Événement', etab: 'Établissement', producer: 'Producteur',
    annonce: 'Annonce', promo: 'Promotion', covoit: 'Covoiturage',
  }

  if (notFound) {
    return <div className={`text-[11px] italic ${mine ? 'text-white/80' : 'text-texte-doux'}`}>Élément supprimé</div>
  }
  if (!details) {
    return <div className={`h-12 w-full animate-pulse rounded-lg ${mine ? 'bg-white/15' : 'bg-cremeDeep'}`} />
  }

  // Tuile large : image hero + meta block. Background blanc/cremeDeep selon
  // côté pour ressortir dans la bubble. Border subtile.
  return (
    <Link
      href={details.href}
      className={`block overflow-hidden rounded-[14px] no-underline ${
        mine ? 'bg-white text-texte' : 'bg-creme text-texte'
      }`}
      style={{
        width: 260, maxWidth: '100%',
        border: '1px solid ' + (mine ? 'rgba(255,255,255,0.3)' : '#E8E0D4'),
        boxShadow: mine ? '0 2px 8px rgba(0,0,0,0.15)' : '0 1px 4px rgba(44,28,16,0.06)',
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* Image hero 130h */}
      <div className="relative h-[130px] w-full overflow-hidden" style={{ background: '#F0EBE3' }}>
        {details.photo ? (
          <img src={details.photo} alt="" className="h-full w-full object-cover" />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #E8F2EB 0%, #C8DEC0 100%)' }}
          >
            <svg width={36} height={36} viewBox="0 0 24 24" fill="none" stroke="#5B8A4A" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
            </svg>
          </div>
        )}
        {/* Kicker badge top-left */}
        <span
          className="absolute left-2 top-2 inline-block rounded-full bg-white/95 px-2 py-[3px] text-[9px] font-extrabold uppercase text-primary"
          style={{ letterSpacing: '0.06em', backdropFilter: 'blur(4px)' }}
        >
          {labels[kind] ?? kind}
        </span>
      </div>
      {/* Meta block */}
      <div className="px-3 py-2.5">
        <div className="font-serif text-[15px] leading-[1.2] text-texte" style={{ letterSpacing: '-0.005em' }}>
          {details.title}
        </div>
        {details.subtitle && (
          <div className="mt-1 truncate text-[11.5px] text-texte-doux">
            {details.subtitle}
          </div>
        )}
      </div>
    </Link>
  )
}
