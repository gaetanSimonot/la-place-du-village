'use client'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { uploadViaSignedUrl, compressImage } from '@/lib/clientUpload'
import ClientPortal from '@/components/ClientPortal'

export interface ProfileEditPatch {
  name:       string
  bio:        string | null
  ville:      string | null
  linkUrl:    string | null
  bannerUrl:  string | null
}

interface Props {
  initialName:       string
  initialBio?:       string | null
  initialVille?:     string | null
  initialLinkUrl?:   string | null
  initialBannerUrl?: string | null
  email:             string
  avatarUrl:         string | null
  onClose:           () => void
  onSave:            (patch: ProfileEditPatch) => void | Promise<void>
}

/* ── Icons (line stroke 1.8) ─────────────────────────────────────────── */
const IcClose = (s = 20) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)
const IcCamera = (s = 13) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
)
const IcPin = (s = 14) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
)
const IcLink = (s = 14) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
)

export default function EditProfileModal({
  initialName,
  initialBio       = null,
  initialVille     = null,
  initialLinkUrl   = null,
  initialBannerUrl = null,
  email,
  avatarUrl,
  onClose,
  onSave,
}: Props) {
  const [name, setName]           = useState(initialName)
  const [bio, setBio]             = useState(initialBio ?? '')
  const [ville, setVille]         = useState(initialVille ?? '')
  const [linkUrl, setLinkUrl]     = useState(initialLinkUrl ?? '')
  const [bannerUrl, setBannerUrl] = useState<string | null>(initialBannerUrl)

  const [saving, setSaving]       = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState<string | null>(null)
  const [linkErr, setLinkErr]     = useState<string | null>(null)

  const nameInputRef = useRef<HTMLInputElement>(null)
  const bannerInput  = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => nameInputRef.current?.focus(), 80)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function validateLink(value: string): string | null {
    const trimmed = value.trim()
    if (!trimmed) return null
    if (trimmed.length > 500) return 'Lien trop long (max 500 caractères)'
    try {
      const u = new URL(trimmed)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        return 'Doit commencer par http:// ou https://'
      }
    } catch {
      return 'Lien invalide'
    }
    return null
  }

  async function handleSave() {
    if (saving) return
    const linkValidation = validateLink(linkUrl)
    if (linkValidation) {
      setLinkErr(linkValidation)
      return
    }
    setLinkErr(null)
    setSaving(true)
    try {
      // Convertit les chaînes vides en null avant Supabase (cf. memory feedback_dates_empty_string).
      const cleanBio  = bio.trim() === '' ? null : bio.trim()
      const cleanVille = ville.trim() === '' ? null : ville.trim()
      const cleanLink  = linkUrl.trim() === '' ? null : linkUrl.trim()
      await onSave({
        name: name.trim(),
        bio: cleanBio,
        ville: cleanVille,
        linkUrl: cleanLink,
        bannerUrl,
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleBannerPick(file: File) {
    setUploadErr(null)
    setUploading(true)
    try {
      const compressed = await compressImage(file, { maxDim: 1600, quality: 0.85 })
      const r = await uploadViaSignedUrl({ file: compressed, kind: 'profile-banner' })
      setBannerUrl(`${r.publicUrl}?v=${Date.now()}`)
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : 'Erreur upload bannière')
    } finally {
      setUploading(false)
    }
  }

  const initial = (name || initialName || '?').trim().charAt(0).toUpperCase() || '?'
  const nameOk = name.trim().length > 0

  return (
    <ClientPortal>
    <div
      className="fixed inset-0 z-[3000] flex flex-col bg-creme font-inter text-texte"
      role="dialog"
      aria-modal="true"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between gap-3 px-4 pb-3 pt-2.5"
        style={{
          borderBottom: '1px solid #F0EAE0',
          paddingTop: 'max(10px, env(safe-area-inset-top, 10px))',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="-ml-2 flex h-10 w-10 items-center justify-center bg-transparent text-texte"
        >
          {IcClose(20)}
        </button>
        <div
          className="flex-1 truncate text-center font-serif text-[17px] text-texte"
          style={{ letterSpacing: '-0.005em' }}
        >
          Modifier le profil
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !nameOk}
          className="rounded-full bg-primary px-3.5 py-[7px] text-[12px] font-extrabold text-white disabled:opacity-60"
        >
          {saving ? '…' : 'Enregistrer'}
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto pb-8">
        {/* Bannière */}
        <div
          className="relative h-[120px] w-full overflow-hidden"
          style={{
            background: bannerUrl
              ? `url(${bannerUrl}) center/cover no-repeat`
              : 'linear-gradient(135deg, #5B8A4A 0%, #2D5A3D 60%, #1A4028 100%)',
          }}
        >
          <input
            ref={bannerInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) handleBannerPick(f)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => bannerInput.current?.click()}
            disabled={uploading}
            className="absolute bottom-2 right-3 flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-bold text-white backdrop-blur disabled:opacity-60"
            style={{
              background: 'rgba(26,18,9,0.55)',
              borderColor: 'rgba(255,255,255,0.2)',
              WebkitBackdropFilter: 'blur(6px)',
              backdropFilter: 'blur(6px)',
            }}
          >
            {IcCamera(12)} {uploading ? 'Upload…' : 'Changer la bannière'}
          </button>
          {bannerUrl && (
            <button
              type="button"
              onClick={() => setBannerUrl(null)}
              disabled={uploading}
              aria-label="Retirer la bannière"
              className="absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-full text-accent backdrop-blur disabled:opacity-60"
              style={{
                background: 'rgba(255,255,255,0.95)',
                WebkitBackdropFilter: 'blur(6px)',
                backdropFilter: 'blur(6px)',
              }}
            >
              {IcClose(14)}
            </button>
          )}
        </div>
        {uploadErr && <p className="px-4 pt-2 text-[11px] text-accent">{uploadErr}</p>}

        {/* Avatar overlap */}
        <div className="-mt-10 px-4">
          <div className="relative inline-block">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="h-20 w-20 rounded-full object-cover"
                style={{ border: '4px solid #FDFAF5', boxShadow: '0 4px 14px rgba(44,28,16,0.18)' }}
              />
            ) : (
              <div
                className="flex h-20 w-20 items-center justify-center rounded-full bg-primary font-serif text-[32px] leading-none text-white"
                style={{
                  border: '4px solid #FDFAF5',
                  boxShadow: '0 4px 14px rgba(44,28,16,0.18)',
                  letterSpacing: '-0.02em',
                }}
              >
                {initial}
              </div>
            )}
            <button
              type="button"
              onClick={() => toast('Modifier la photo bientôt', { description: 'L\'upload d\'avatar arrive dans une PR dédiée.' })}
              aria-label="Modifier la photo de profil"
              className="absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-white text-texte"
              style={{ border: '2px solid #FDFAF5', boxShadow: '0 2px 4px rgba(0,0,0,0.08)' }}
            >
              {IcCamera(13)}
            </button>
          </div>
        </div>

        {/* Form */}
        <div className="flex flex-col gap-3.5 px-4 pt-[18px]">
          <FieldInput
            label="Nom d'affichage"
            value={name}
            onChange={setName}
            placeholder="Votre prénom ou pseudo"
            maxLength={64}
            inputRef={nameInputRef}
            required
            onEnter={handleSave}
          />

          <FieldTextarea
            label="Bio"
            value={bio}
            onChange={setBio}
            placeholder="Une ou deux phrases pour te présenter…"
            maxLength={500}
          />

          <FieldInput
            label="Localisation"
            value={ville}
            onChange={setVille}
            placeholder="Ganges, Hérault"
            icon={IcPin(14)}
            maxLength={80}
          />

          <FieldInput
            label="Lien (optionnel)"
            value={linkUrl}
            onChange={v => { setLinkUrl(v); if (linkErr) setLinkErr(null) }}
            placeholder="https://…"
            icon={IcLink(14)}
            maxLength={500}
            error={linkErr}
            inputType="url"
          />

          {/* Note d'info — email + autres params déménagés en Réglages */}
          <div
            className="mt-1.5 rounded-[12px] border px-3 py-2.5 text-[11px] leading-[1.5] text-texte-doux"
            style={{ borderColor: '#F0EAE0', background: '#FDFAF5' }}
          >
            {email} · l&apos;email, le genre, la confidentialité et les notifications sont dans Réglages.
          </div>
        </div>
      </div>
    </div>
    </ClientPortal>
  )
}

/* ── Sub : Input field ────────────────────────────────────────────────── */
function FieldInput({
  label, value, onChange, placeholder, icon, maxLength, required, inputRef, onEnter, error, inputType = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  icon?: React.ReactNode
  maxLength?: number
  required?: boolean
  inputRef?: React.RefObject<HTMLInputElement>
  onEnter?: () => void
  error?: string | null
  inputType?: string
}) {
  const filled = value.trim().length > 0
  return (
    <label className="block">
      <span
        className="mb-1.5 block text-[11px] font-extrabold uppercase text-texte-doux"
        style={{ letterSpacing: '0.06em' }}
      >
        {label}
      </span>
      <div
        className="flex items-center gap-2.5 rounded-[12px] border bg-white px-3.5 py-3"
        style={{
          borderColor: error ? '#C84B2F' : filled && required ? '#2D5A3D' : '#E8E0D4',
        }}
      >
        {icon && <span className="shrink-0 text-texte-doux">{icon}</span>}
        <input
          ref={inputRef}
          type={inputType}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter() } }}
          placeholder={placeholder}
          maxLength={maxLength}
          className="flex-1 bg-transparent text-[14px] font-medium text-texte outline-none placeholder:text-texte-tres-doux"
          style={{ colorScheme: 'light' }}
        />
      </div>
      {error && <span className="mt-1 block text-[11px] text-accent">{error}</span>}
    </label>
  )
}

/* ── Sub : Textarea field ──────────────────────────────────────────────── */
function FieldTextarea({
  label, value, onChange, placeholder, maxLength,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  maxLength?: number
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span
          className="text-[11px] font-extrabold uppercase text-texte-doux"
          style={{ letterSpacing: '0.06em' }}
        >
          {label}
        </span>
        {maxLength && (
          <span className="text-[10.5px] text-texte-tres-doux">
            {value.length}/{maxLength}
          </span>
        )}
      </div>
      <div
        className="rounded-[12px] border bg-white px-3.5 py-3"
        style={{ borderColor: '#E8E0D4' }}
      >
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          rows={3}
          className="block min-h-[70px] w-full resize-none bg-transparent text-[14px] font-medium leading-[1.5] text-texte outline-none placeholder:text-texte-tres-doux"
          style={{ colorScheme: 'light' }}
        />
      </div>
    </label>
  )
}
