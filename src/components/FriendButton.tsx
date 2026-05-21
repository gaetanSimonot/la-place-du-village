'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import type { FriendshipStateForMe } from '@/lib/friendships'

interface Props {
  targetUserId:   string
  state:          FriendshipStateForMe
  onSendRequest:  (userId: string) => Promise<void>
  onAccept:       (friendshipId: string) => Promise<void>
  onCancel:       (friendshipId: string) => Promise<void>
  /** Style compact (sur PersonCard) ou plus visible (sur fiche profil). */
  size?:          'sm' | 'md'
  /** Affiche aussi le bouton "Discuter" quand on est amis. Defaults: true. */
  showChat?:      boolean
}

// SVG icons inline (pas d'emoji ni unicode)
function IconCheck({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}
function IconPlus({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  )
}
function IconChat({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
    </svg>
  )
}
function IconCross({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  )
}

/**
 * Bouton ami avec 4 états :
 *   - none      → "+ Ajouter"
 *   - sent      → "Demande envoyée" (cliquer = annuler)
 *   - received  → "Accepter" + "Refuser"
 *   - friends   → "✓ Amis" (cliquer = défaire)
 *
 * Stoppe la propagation du click → ne déclenche pas le href parent (PersonCard).
 */
export default function FriendButton({ targetUserId, state, onSendRequest, onAccept, onCancel, size = 'sm', showChat = true }: Props) {
  const { user } = useAuth()
  const { openAuthModal } = useAuthModal()
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  // Le user lui-même : aucun bouton
  if (user && user.id === targetUserId) return null

  const small = size === 'sm'
  const baseBtn = small
    ? 'rounded-full px-2.5 py-1 text-[11px] font-bold inline-flex items-center gap-1'
    : 'rounded-xl px-3 py-2 text-[13px] font-bold inline-flex items-center gap-1.5'

  const run = async (fn: () => Promise<void>) => {
    if (busy) return
    if (!user) { openAuthModal(); return }
    setBusy(true)
    try { await fn() } catch (e) {
      console.error('[FriendButton]', e)
    } finally { setBusy(false) }
  }

  const stop = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation() }

  // Ouvre (ou crée) la conv friend et navigate vers /conversations/[id]
  const openChat = async () => {
    if (!user) { openAuthModal(); return }
    setBusy(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return
      const res = await fetch('/api/conversations/friend/open', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ user_id: targetUserId }),
      })
      const data = await res.json()
      if (res.ok && data.conversation_id) {
        router.push(`/conversations/${data.conversation_id}`)
      } else {
        console.error('[FriendButton] open chat failed:', data.error)
      }
    } finally { setBusy(false) }
  }

  const iconSz = small ? 10 : 13

  // STATE: none
  if (state.kind === 'none') {
    return (
      <button
        onClick={e => { stop(e); run(() => onSendRequest(targetUserId)) }}
        disabled={busy}
        className={`${baseBtn} border border-primary bg-primary text-white disabled:opacity-60`}
      >
        {busy ? '…' : <><IconPlus size={iconSz} /> {small ? 'Ajouter' : 'Ajouter en ami'}</>}
      </button>
    )
  }

  // STATE: sent (= demande envoyée, en attente)
  if (state.kind === 'sent') {
    const id = state.friendshipId
    return (
      <button
        onClick={e => { stop(e); run(() => onCancel(id)) }}
        disabled={busy}
        title="Cliquer pour annuler la demande"
        className={`${baseBtn} border border-bord bg-white text-texte-doux disabled:opacity-60`}
      >
        {busy ? '…' : 'Demande envoyée'}
      </button>
    )
  }

  // STATE: received (= demande reçue, à accepter ou refuser)
  if (state.kind === 'received') {
    const id = state.friendshipId
    return (
      <div onClick={stop} className="flex shrink-0 items-center gap-1.5">
        <button
          onClick={e => { stop(e); run(() => onAccept(id)) }}
          disabled={busy}
          className={`${baseBtn} border border-primary bg-primary text-white disabled:opacity-60`}
        >
          <IconCheck size={iconSz} /> Accepter
        </button>
        <button
          onClick={e => { stop(e); run(() => onCancel(id)) }}
          disabled={busy}
          className={`${baseBtn} border border-bord bg-white text-texte-doux disabled:opacity-60`}
        >
          <IconCross size={iconSz} /> Refuser
        </button>
      </div>
    )
  }

  // STATE: friends
  if (state.kind === 'friends') {
    const id = state.friendshipId
    return (
      <div onClick={stop} className="flex shrink-0 items-center gap-1.5">
        {showChat && (
          <button
            onClick={e => { stop(e); openChat() }}
            disabled={busy}
            title="Ouvrir la conversation"
            aria-label="Discuter"
            className={`${baseBtn} border border-primary bg-primary text-white disabled:opacity-60`}
          >
            <IconChat size={iconSz} /> Discuter
          </button>
        )}
        <button
          onClick={e => {
            stop(e)
            if (confirm('Retirer cette personne de tes amis ?')) run(() => onCancel(id))
          }}
          disabled={busy}
          title="Cliquer pour défaire"
          className={`${baseBtn} border border-primary-light bg-primary-light text-primary disabled:opacity-60`}
        >
          <IconCheck size={iconSz} /> Amis
        </button>
      </div>
    )
  }

  // STATE: blocked → pas de bouton (UX blocage hors scope)
  return null
}
