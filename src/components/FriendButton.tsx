'use client'
import { useState } from 'react'
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
export default function FriendButton({ targetUserId, state, onSendRequest, onAccept, onCancel, size = 'sm' }: Props) {
  const { user } = useAuth()
  const { openAuthModal } = useAuthModal()
  const [busy, setBusy] = useState(false)

  // Le user lui-même : aucun bouton
  if (user && user.id === targetUserId) return null

  const small = size === 'sm'
  const baseBtn = small
    ? 'rounded-full px-2.5 py-1 text-[11px] font-bold'
    : 'rounded-xl px-3 py-2 text-[13px] font-bold'

  const run = async (fn: () => Promise<void>) => {
    if (busy) return
    if (!user) { openAuthModal(); return }
    setBusy(true)
    try { await fn() } catch (e) {
      console.error('[FriendButton]', e)
    } finally { setBusy(false) }
  }

  const stop = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation() }

  // STATE: none
  if (state.kind === 'none') {
    return (
      <button
        onClick={e => { stop(e); run(() => onSendRequest(targetUserId)) }}
        disabled={busy}
        className={`${baseBtn} border border-primary bg-primary text-white disabled:opacity-60`}
      >
        {busy ? '…' : (small ? '+ Ajouter' : '+ Ajouter en ami')}
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
          ✓ Accepter
        </button>
        <button
          onClick={e => { stop(e); run(() => onCancel(id)) }}
          disabled={busy}
          className={`${baseBtn} border border-bord bg-white text-texte-doux disabled:opacity-60`}
        >
          Refuser
        </button>
      </div>
    )
  }

  // STATE: friends
  if (state.kind === 'friends') {
    const id = state.friendshipId
    return (
      <button
        onClick={e => {
          stop(e)
          if (confirm('Retirer cette personne de tes amis ?')) run(() => onCancel(id))
        }}
        disabled={busy}
        title="Cliquer pour défaire"
        className={`${baseBtn} border border-primary-light bg-primary-light text-primary disabled:opacity-60`}
      >
        ✓ Amis
      </button>
    )
  }

  // STATE: blocked → pas de bouton (UX blocage hors scope)
  return null
}
