'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import ClientPortal from '@/components/ClientPortal'

interface Props {
  email:    string
  signOut:  () => Promise<void>
  onClose:  () => void
}

const CONFIRM_WORD = 'SUPPRIMER'

/**
 * Suppression définitive du compte de l'utilisateur authentifié.
 *
 * Pas de mailto, pas d'email tiers exposé : on appelle directement
 * /api/profile/delete (DELETE, scope auth.uid()) puis signOut côté client.
 */
export default function DeleteAccountModal({ email, signOut, onClose }: Props) {
  const { isAdmin } = useAuth()
  const [deleting, setDeleting] = useState(false)
  const [confirmInput, setConfirmInput] = useState('')
  const canDelete = !isAdmin && confirmInput.trim().toUpperCase() === CONFIRM_WORD && !deleting

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !deleting) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, deleting])

  async function handleDelete() {
    if (deleting) return
    setDeleting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Session expirée — reconnecte-toi')

      const res = await fetch('/api/profile/delete', {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Erreur lors de la suppression')
      }

      await signOut()
      if (typeof window !== 'undefined') window.location.href = '/'
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur lors de la suppression')
      setDeleting(false)
    }
  }

  return (
    <ClientPortal>
    <div
      className="fixed inset-0 z-[3500] flex items-end justify-center bg-black/55 backdrop-blur-[3px] font-inter"
      onClick={() => { if (!deleting) onClose() }}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-[480px] rounded-t-3xl bg-white px-5 pb-7 pt-3.5"
        style={{ paddingBottom: 'max(28px, env(safe-area-inset-bottom, 28px))' }}
      >
        <div className="mx-auto mb-3.5 h-[5px] w-11 rounded-[3px] bg-[#E4DED2]" />

        <h2
          className="m-0 mb-1.5 font-serif text-[22px]"
          style={{ letterSpacing: '-0.005em', color: '#B53A22' }}
        >
          Supprimer mon compte ?
        </h2>
        <p className="m-0 mb-4 text-[13px] leading-[1.55] text-texte">
          Cette action est <strong>définitive et immédiate</strong>. Ton compte, tes annonces,
          tes événements, ta fiche pro et tes messages seront supprimés.
        </p>

        <div
          className="mb-5 rounded-[12px] border px-3.5 py-3 text-[12px] leading-[1.5] text-texte-doux"
          style={{ borderColor: '#F0EAE0', background: '#FDFAF5' }}
        >
          Compte : <strong className="text-texte">{email}</strong>
        </div>

        {isAdmin ? (
          <div
            className="mb-5 rounded-[12px] border px-3.5 py-3 text-[12px] leading-[1.5]"
            style={{ borderColor: '#F0D4C8', background: '#FDF4F0', color: '#B53A22' }}
          >
            <strong>Impossible :</strong> les comptes administrateurs ne peuvent pas s&apos;auto-supprimer
            depuis cette interface. Pour supprimer un compte admin, retire d&apos;abord son email
            de la table <code>admin_emails</code> côté Supabase.
          </div>
        ) : (
          <>
            <label className="m-0 mb-1 block text-[12px] font-bold text-texte">
              Pour confirmer, tape <span style={{ color: '#B53A22' }}>SUPPRIMER</span> ci-dessous :
            </label>
            <input
              type="text"
              value={confirmInput}
              onChange={e => setConfirmInput(e.target.value)}
              placeholder="SUPPRIMER"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              disabled={deleting}
              className="mb-4 w-full rounded-[12px] border bg-white px-3 py-2.5 text-[14px] font-bold text-texte outline-none"
              style={{ borderColor: canDelete ? '#B53A22' : '#E0D8CE', letterSpacing: '0.1em' }}
            />
          </>
        )}

        <button
          type="button"
          onClick={handleDelete}
          disabled={!canDelete}
          className="w-full rounded-[14px] border-none py-3 text-[14px] font-extrabold text-white disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: '#B53A22' }}
        >
          {deleting ? 'Suppression…' : 'Oui, supprimer mon compte'}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={deleting}
          className="mt-2 w-full bg-transparent py-2.5 text-[13px] font-semibold text-texte-doux disabled:opacity-60"
        >
          Annuler
        </button>
      </div>
    </div>
    </ClientPortal>
  )
}
