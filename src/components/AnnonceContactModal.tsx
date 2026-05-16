'use client'
import { useEffect, useRef, useState } from 'react'

const MAX = 500
const SUGGESTIONS = [
  'Toujours disponible ?',
  'Possible de venir voir ?',
  'Prix négociable ?',
]

interface Props {
  open:         boolean
  vendeurNom:   string
  annonceTitre: string
  loading?:     boolean
  onClose:      () => void
  onSubmit:     (message: string) => void
}

export default function AnnonceContactModal({
  open, vendeurNom, annonceTitre, loading = false, onClose, onSubmit,
}: Props) {
  const [msg, setMsg] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!open) { setMsg(''); return }
    const t = setTimeout(() => textareaRef.current?.focus(), 80)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const canSend = msg.trim().length > 0 && !loading

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[3000] flex items-end justify-center bg-black/55 backdrop-blur-[3px] font-inter"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-[480px] rounded-t-3xl bg-white px-5 pb-7 pt-[18px]"
        style={{ paddingBottom: 'max(28px, env(safe-area-inset-bottom, 28px))' }}
      >
        {/* Grabber */}
        <div className="mx-auto mb-4 h-[5px] w-11 rounded-[3px] bg-[#E4DED2]" />

        <h2
          className="m-0 mb-1 font-serif text-[24px] font-normal text-texte"
          style={{ letterSpacing: '-0.01em' }}
        >
          Écrire à {vendeurNom}
        </h2>
        <p className="m-0 mb-[18px] text-[13px] text-texte-doux">
          À propos de <strong className="text-texte">«&nbsp;{annonceTitre}&nbsp;»</strong>
        </p>

        {/* Chips de suggestions */}
        <div className="mb-3.5 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setMsg(prev => (prev ? prev + ' ' + s : 'Bonjour, ' + s.toLowerCase()))
                textareaRef.current?.focus()
              }}
              className="cursor-pointer rounded-full border border-bord bg-cremeDeep px-3 py-1.5 text-[12px] font-semibold text-texte-doux"
            >
              {s}
            </button>
          ))}
        </div>

        {/* Textarea */}
        <div
          className="rounded-[14px] border-[1.5px] bg-white px-3.5 py-3.5"
          style={{ borderColor: msg.length > 0 ? '#2D5A3D' : '#E8E0D4' }}
        >
          <textarea
            ref={textareaRef}
            value={msg}
            onChange={e => setMsg(e.target.value.slice(0, MAX))}
            placeholder={`Bonjour ${vendeurNom}, votre annonce est-elle toujours disponible ?`}
            rows={4}
            className="block w-full resize-none border-none bg-transparent text-[14px] leading-[1.5] text-texte outline-none placeholder:text-texte-tres-doux"
            style={{ minHeight: 84 }}
          />
          <div className="mt-2 flex justify-between text-[11px] text-texte-tres-doux">
            <span>Le vendeur ne voit pas votre email</span>
            <span>{msg.length} / {MAX}</span>
          </div>
        </div>

        {/* Notice */}
        <div className="mt-3.5 flex items-start gap-2 text-[11px] text-texte-doux">
          <div className="mt-0.5 shrink-0 text-primary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <span>Premier message gratuit. La conversation continue dans <strong className="text-texte">Messages</strong>.</span>
        </div>

        {/* CTA */}
        <button
          type="button"
          disabled={!canSend}
          onClick={() => onSubmit(msg.trim())}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border-none bg-primary py-3.5 text-[14px] font-bold text-white disabled:opacity-50"
        >
          {loading ? (
            'Envoi…'
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
              Envoyer le message
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-1.5 w-full bg-transparent py-2.5 text-[13px] font-semibold text-texte-doux"
        >
          Annuler
        </button>
      </div>
    </div>
  )
}
