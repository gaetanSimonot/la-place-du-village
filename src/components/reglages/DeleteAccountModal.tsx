'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import ClientPortal from '@/components/ClientPortal'

interface Props {
  email:    string
  signOut:  () => Promise<void>
  onClose:  () => void
}

/**
 * Suppression définitive du compte de l'utilisateur authentifié.
 *
 * Pas de mailto, pas d'email tiers exposé : on appelle directement
 * /api/profile/delete (DELETE, scope auth.uid()) puis signOut côté client.
 */
export default function DeleteAccountModal({ email, signOut, onClose }: Props) {
  const [deleting, setDeleting] = useState(false)

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

        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="w-full rounded-[14px] border-none py-3 text-[14px] font-extrabold text-white disabled:opacity-60"
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
