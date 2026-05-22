'use client'
import { useEffect, useState } from 'react'

interface Props {
  email: string
  onClose: () => void
}

const SUPPORT_EMAIL = 'gaetan.simonot@gmail.com'

/**
 * Modale de demande de suppression de compte.
 *
 * RGPD : la suppression effective est faite manuellement (vérification d'identité
 * + nettoyage des contenus liés annonces/events/messages). On ouvre un mailto
 * pré-rempli avec l'email du compte pour traçabilité.
 *
 * Un vrai endpoint /api/profile/delete avec hard delete + cascade arrivera dans
 * une PR RGPD dédiée.
 */
export default function DeleteAccountModal({ email, onClose }: Props) {
  const [confirmText, setConfirmText] = useState('')
  const canSend = confirmText.trim().toUpperCase() === 'SUPPRIMER'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function sendRequest() {
    const subject = encodeURIComponent('Demande de suppression de compte')
    const body = encodeURIComponent(
      `Bonjour,\n\nJe demande la suppression définitive de mon compte La Place du Village.\n\nEmail du compte : ${email}\n\nMerci de me confirmer une fois la suppression effectuée.`,
    )
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[3500] flex items-end justify-center bg-black/55 backdrop-blur-[3px] font-inter"
      onClick={onClose}
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
          className="m-0 mb-1.5 font-serif text-[22px] text-texte"
          style={{ letterSpacing: '-0.005em', color: '#B53A22' }}
        >
          Supprimer mon compte
        </h2>
        <p className="m-0 mb-4 text-[13px] leading-[1.55] text-texte-doux">
          Cette action est <strong className="text-texte">définitive</strong>. Tes annonces, événements,
          messages et fiche pro seront supprimés. Pour des raisons légales (RGPD), la suppression est
          validée manuellement par l&apos;équipe.
        </p>

        <div
          className="mb-4 rounded-[12px] border px-3.5 py-3 text-[12px] leading-[1.5] text-texte-doux"
          style={{ borderColor: '#F0EAE0', background: '#FDFAF5' }}
        >
          Compte concerné : <strong className="text-texte">{email}</strong>
        </div>

        <label className="mb-1.5 block text-[11px] font-extrabold uppercase text-texte-doux" style={{ letterSpacing: '0.06em' }}>
          Tape « SUPPRIMER » pour activer
        </label>
        <input
          type="text"
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          placeholder="SUPPRIMER"
          autoCapitalize="characters"
          className="mb-4 w-full rounded-[12px] border bg-white px-3.5 py-3 text-[14px] font-bold uppercase tracking-wider text-texte outline-none placeholder:font-normal placeholder:text-texte-tres-doux placeholder:normal-case"
          style={{
            borderColor: canSend ? '#B53A22' : '#E8E0D4',
            colorScheme: 'light',
          }}
        />

        <button
          type="button"
          onClick={sendRequest}
          disabled={!canSend}
          className="w-full rounded-[14px] border-none py-3 text-[14px] font-extrabold text-white disabled:opacity-50"
          style={{ background: canSend ? '#B53A22' : '#C8B5AE' }}
        >
          Envoyer la demande de suppression
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full bg-transparent py-2.5 text-[13px] font-semibold text-texte-doux"
        >
          Annuler
        </button>
      </div>
    </div>
  )
}
