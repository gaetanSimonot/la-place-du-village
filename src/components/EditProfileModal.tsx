'use client'
import { useEffect, useRef, useState } from 'react'

interface Props {
  initialName: string
  email:       string
  avatarUrl:   string | null
  onClose:     () => void
  onSave:      (name: string) => void | Promise<void>
}

export default function EditProfileModal({ initialName, email, avatarUrl, onClose, onSave }: Props) {
  const [name, setName] = useState(initialName)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSave() {
    if (saving) return
    setSaving(true)
    try { await onSave(name) } finally { setSaving(false) }
  }

  const initial = (name || initialName || '?')[0]?.toUpperCase() ?? '?'

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[3000] flex items-end justify-center bg-black/55 backdrop-blur-[3px] font-inter"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-[480px] rounded-t-3xl bg-white px-5 pb-7 pt-3.5"
        style={{ paddingBottom: 'max(28px, env(safe-area-inset-bottom, 28px))' }}
      >
        <div className="mx-auto mb-3.5 h-[5px] w-11 rounded-[3px] bg-[#E4DED2]" />

        <h2
          className="m-0 mb-1 font-serif text-[22px] font-normal text-texte"
          style={{ letterSpacing: '-0.01em' }}
        >
          Modifier mon profil
        </h2>
        <p className="m-0 mb-[18px] text-[13px] text-texte-doux">
          Affiché aux autres habitants du village.
        </p>

        {/* Avatar (display-only pour l'instant) */}
        <div className="mb-5 flex flex-col items-center">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="h-[84px] w-[84px] rounded-full object-cover"
              style={{ border: '3px solid #E8F2EB' }}
            />
          ) : (
            <div
              className="flex h-[84px] w-[84px] items-center justify-center rounded-full bg-primary text-[32px] font-extrabold text-white"
              style={{ border: '3px solid #E8F2EB' }}
            >
              {initial}
            </div>
          )}
          {/* L'upload d'avatar n'est pas encore branché côté backend.
              Le bouton est masqué pour éviter une UX cassée. */}
        </div>

        {/* Name input */}
        <div className="mb-3.5">
          <label className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-[0.1em] text-texte-doux">
            Nom affiché
          </label>
          <input
            ref={inputRef}
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            placeholder="Votre prénom ou pseudo"
            className="w-full rounded-2xl border-[1.5px] bg-white px-3.5 py-3 text-[15px] font-semibold text-texte outline-none placeholder:text-texte-tres-doux"
            style={{ borderColor: name.trim() ? '#2D5A3D' : '#E8E0D4' }}
            maxLength={64}
          />
        </div>

        {/* Email (readonly) */}
        <div className="mb-[18px]">
          <label className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-[0.1em] text-texte-doux">
            Email
          </label>
          <div
            className="rounded-2xl border bg-cremeDeep px-3.5 py-3 text-[15px] font-medium text-texte-doux"
            style={{ borderColor: '#E8E0D4' }}
          >
            {email}
          </div>
          <div className="ml-1 mt-1 text-[11px] text-texte-tres-doux">Non modifiable</div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="w-full rounded-2xl border-none bg-primary py-3.5 text-[14px] font-bold text-white disabled:opacity-60"
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button
          onClick={onClose}
          className="mt-1.5 w-full bg-transparent py-2.5 text-[13px] font-semibold text-texte-doux"
        >
          Annuler
        </button>
      </div>
    </div>
  )
}
