'use client'
import { useEffect, useRef, useState } from 'react'
import { uploadViaSignedUrl, compressImage } from '@/lib/clientUpload'

type Genre = 'homme' | 'femme' | 'autre' | null

export interface ProfileEditPatch {
  name:       string
  genre:      Genre
  bannerUrl:  string | null
  isPublic:   boolean
  searchable: boolean
}

interface Props {
  initialName:       string
  initialGenre?:     Genre
  initialBannerUrl?: string | null
  initialIsPublic?:  boolean
  initialSearchable?: boolean
  email:             string
  avatarUrl:         string | null
  onClose:           () => void
  onSave:            (patch: ProfileEditPatch) => void | Promise<void>
}

export default function EditProfileModal({
  initialName,
  initialGenre = null,
  initialBannerUrl = null,
  initialIsPublic = true,
  initialSearchable = true,
  email,
  avatarUrl,
  onClose,
  onSave,
}: Props) {
  const [name, setName]               = useState(initialName)
  const [genre, setGenre]             = useState<Genre>(initialGenre)
  const [bannerUrl, setBannerUrl]     = useState<string | null>(initialBannerUrl)
  const [isPublic, setIsPublic]       = useState(initialIsPublic)
  const [searchable, setSearchable]   = useState(initialSearchable)
  const [saving, setSaving]           = useState(false)
  const [uploading, setUploading]     = useState(false)
  const [uploadErr, setUploadErr]     = useState<string | null>(null)
  const inputRef    = useRef<HTMLInputElement>(null)
  const bannerInput = useRef<HTMLInputElement>(null)

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
    try { await onSave({ name, genre, bannerUrl, isPublic, searchable }) }
    finally { setSaving(false) }
  }

  async function handleBannerPick(file: File) {
    setUploadErr(null)
    setUploading(true)
    try {
      // Compresse (largeur max 1600px, qualité 0.85) puis upload via signed URL
      const compressed = await compressImage(file, { maxDim: 1600, quality: 0.85 })
      const r = await uploadViaSignedUrl({ file: compressed, kind: 'profile-banner' })
      // Cache buster — sinon Next/img garde la vieille image (path FIXE par user)
      setBannerUrl(`${r.publicUrl}?v=${Date.now()}`)
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : 'Erreur upload bannière')
    } finally {
      setUploading(false)
    }
  }

  const GENRE_OPTIONS: { value: Genre; label: string }[] = [
    { value: 'homme', label: 'Homme' },
    { value: 'femme', label: 'Femme' },
    { value: 'autre', label: 'Autre' },
    { value: null,    label: 'Préfère ne pas dire' },
  ]

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

        {/* Bannière + avatar superposés */}
        <div className="mb-5">
          {/* Bannière */}
          <div
            className="relative h-[110px] w-full overflow-hidden rounded-2xl"
            style={{ backgroundColor: bannerUrl ? 'transparent' : '#E8F2EB' }}
          >
            {bannerUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={bannerUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-[11px] font-bold uppercase tracking-[0.08em] text-primary/60">
                Ajoute une bannière
              </div>
            )}
            <button
              type="button"
              onClick={() => bannerInput.current?.click()}
              disabled={uploading}
              aria-label="Modifier la bannière"
              className="absolute right-2 top-2 flex h-8 items-center gap-1.5 rounded-full bg-white/95 px-2.5 text-[11px] font-bold text-texte shadow-sm backdrop-blur disabled:opacity-50"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
              </svg>
              {uploading ? '…' : (bannerUrl ? 'Changer' : 'Ajouter')}
            </button>
            {bannerUrl && (
              <button
                type="button"
                onClick={() => setBannerUrl(null)}
                disabled={uploading}
                aria-label="Retirer la bannière"
                className="absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-accent shadow-sm backdrop-blur disabled:opacity-50"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            )}
          </div>
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
          {uploadErr && <p className="mt-1.5 text-[11px] text-accent">{uploadErr}</p>}

          {/* Avatar (display-only) — chevauche la bannière */}
          <div className="-mt-10 flex justify-center">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                className="h-[84px] w-[84px] rounded-full object-cover"
                style={{ border: '3px solid #fff' }}
              />
            ) : (
              <div
                className="flex h-[84px] w-[84px] items-center justify-center rounded-full bg-primary text-[32px] font-extrabold text-white"
                style={{ border: '3px solid #fff' }}
              >
                {initial}
              </div>
            )}
          </div>
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

        {/* Genre (optionnel) */}
        <div className="mb-[18px]">
          <label className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-[0.1em] text-texte-doux">
            Genre <span className="font-normal text-texte-tres-doux">(optionnel)</span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {GENRE_OPTIONS.map(opt => {
              const active = genre === opt.value
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setGenre(opt.value)}
                  className={`rounded-full border px-3 py-1.5 text-[12px] font-bold transition-colors ${
                    active
                      ? 'border-primary bg-primary-light text-primary'
                      : 'border-bord bg-white text-texte'
                  }`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Confidentialité */}
        <div className="mb-[18px]">
          <label className="mb-2 block text-[11px] font-extrabold uppercase tracking-[0.1em] text-texte-doux">
            Confidentialité
          </label>
          <div className="space-y-2 rounded-2xl border border-bord bg-white p-3.5">
            <ToggleRow
              label="Apparaître sur la page « Les gens »"
              hint="Décoche pour rester invisible dans la liste publique des membres."
              checked={isPublic}
              onChange={setIsPublic}
            />
            <div className="h-px bg-bordSoft" />
            <ToggleRow
              label="Apparaître dans la recherche"
              hint="Décoche pour ne pas être trouvé via la barre de recherche."
              checked={searchable}
              onChange={setSearchable}
            />
          </div>
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

function ToggleRow({
  label, hint, checked, onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex w-full cursor-pointer items-center justify-between gap-3 py-1">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold text-texte">{label}</div>
        {hint && <div className="mt-0.5 text-[11px] text-texte-doux">{hint}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-bord'}`}
      >
        <span
          className={`absolute top-0.5 inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'left-[18px]' : 'left-0.5'}`}
        />
      </button>
    </label>
  )
}
