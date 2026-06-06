'use client'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import ClientPortal from '@/components/ClientPortal'
import EmbedPicker, { type EmbedItem } from '@/components/EmbedPicker'
import { compressAndUpload } from '@/lib/clientUpload'
import { type MediaItem, MAX_PHOTOS, youtubeId, youtubeThumb } from '@/lib/postMedia'

export type Visibility = 'public' | 'amis' | 'prive'

type NotifyAudience = 'none' | 'all' | 'basic' | 'habitants' | 'pro'
const NOTIFY_OPTIONS: Array<{ value: NotifyAudience; label: string }> = [
  { value: 'none',      label: 'Personne' },
  { value: 'all',       label: 'Tout le monde' },
  { value: 'basic',     label: 'Villageois' },
  { value: 'habitants', label: 'Habitants' },
  { value: 'pro',       label: 'Pro' },
]

export interface CreatedPost {
  id: string; user_id: string; texte: string; visibility: Visibility;
  embed_kind: string | null; embed_ref_id: string | null
  media: MediaItem[] | null; created_at: string
}

interface Props {
  authorName:   string
  authorAvatar: string | null
  onClose:      () => void
  onPosted:     (post: CreatedPost) => void
}

const VIS_OPTIONS: Array<{ value: Visibility; label: string; sub: string }> = [
  { value: 'public', label: 'Public',  sub: 'Visible de tout le village' },
  { value: 'amis',   label: 'Amis',    sub: 'Mes amis seulement' },
  { value: 'prive',  label: 'Privé',   sub: 'Visible que par moi' },
]

const MAX = 2000

export default function PostComposer({ authorName, authorAvatar, onClose, onPosted }: Props) {
  const [texte, setTexte]           = useState('')
  const [visibility, setVisibility] = useState<Visibility>('public')
  const [posting, setPosting]       = useState(false)
  const [embed, setEmbed]           = useState<EmbedItem | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [notify, setNotify]         = useState<NotifyAudience>('none')
  const [media, setMedia]           = useState<MediaItem[]>([])
  const [uploading, setUploading]   = useState(false)
  const [linkOpen, setLinkOpen]     = useState(false)
  const [linkInput, setLinkInput]   = useState('')
  const [fetchingLink, setFetchingLink] = useState(false)
  const { isAdmin } = useAuth()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const photoCount = media.filter(m => m.t === 'photo').length

  async function handlePickPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    const slots = MAX_PHOTOS - photoCount
    if (slots <= 0) { toast.error(`Maximum ${MAX_PHOTOS} photos`); return }
    setUploading(true)
    try {
      for (const file of files.slice(0, slots)) {
        const { publicUrl } = await compressAndUpload(file, { kind: 'post-media' })
        setMedia(prev => [...prev, { t: 'photo', url: publicUrl }])
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Échec upload photo')
    } finally {
      setUploading(false)
    }
  }

  async function handleAddLink() {
    const url = linkInput.trim()
    if (!url) return
    const yt = youtubeId(url)
    if (yt) {
      setMedia(prev => [...prev, { t: 'youtube', id: yt }])
      setLinkInput(''); setLinkOpen(false)
      return
    }
    if (!/^https?:\/\//i.test(url)) { toast.error('Lien invalide (http/https)'); return }
    setFetchingLink(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const d = await res.json().catch(() => ({}))
      setMedia(prev => [...prev, { t: 'link', url, title: d.title ?? null, description: d.description ?? null, image: d.image ?? null }])
      setLinkInput(''); setLinkOpen(false)
    } catch {
      setMedia(prev => [...prev, { t: 'link', url, title: null, description: null, image: null }])
      setLinkInput(''); setLinkOpen(false)
    } finally {
      setFetchingLink(false)
    }
  }

  function removeMedia(idx: number) {
    setMedia(prev => prev.filter((_, i) => i !== idx))
  }

  useEffect(() => {
    const t = setTimeout(() => textareaRef.current?.focus(), 80)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !posting) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, posting])

  async function handlePublier() {
    if (posting || uploading) return
    const trimmed = texte.trim()
    if (trimmed.length === 0 && media.length === 0) return
    setPosting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Session expirée')

      const res = await fetch('/api/posts', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({
          texte: trimmed,
          visibility,
          embed_kind:   embed?.kind ?? null,
          embed_ref_id: embed?.id ?? null,
          media,
          // Broadcast admin (le serveur revérifie isAdmin). Omis si non-admin ou "Personne".
          notify: isAdmin && notify !== 'none' ? notify : undefined,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(d.error || 'Erreur publication')
      }
      if (d.post) onPosted(d.post as CreatedPost)
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
      setPosting(false)
    }
  }

  const initial = (authorName || '·').trim().charAt(0).toUpperCase() || '·'
  const canSend = (texte.trim().length > 0 || media.length > 0) && !posting && !uploading

  return (
    <ClientPortal>
    <div
      className="fixed inset-0 z-[3500] flex flex-col bg-creme font-inter text-texte"
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
          disabled={posting}
          className="-ml-2 flex h-10 w-10 items-center justify-center bg-transparent text-texte disabled:opacity-60"
        >
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <div
          className="flex-1 truncate text-center font-serif text-[17px] text-texte"
          style={{ letterSpacing: '-0.005em' }}
        >
          Nouvelle publication
        </div>
        <button
          type="button"
          onClick={handlePublier}
          disabled={!canSend}
          className="rounded-full bg-primary px-3.5 py-[7px] text-[12px] font-extrabold text-white disabled:opacity-50"
        >
          {posting ? '…' : 'Publier'}
        </button>
      </div>

      {/* Body scrollable */}
      <div className="flex-1 overflow-y-auto px-4 pt-4">
        {/* Auteur + visibility */}
        <div className="mb-3 flex items-center gap-2.5">
          {authorAvatar ? (
            <img src={authorAvatar} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary font-serif text-[16px] text-white">
              {initial}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-extrabold text-texte" style={{ letterSpacing: '-0.005em' }}>
              {authorName}
            </div>
            <VisibilityPicker value={visibility} onChange={setVisibility} />
          </div>
        </div>

        {/* Texte */}
        <textarea
          ref={textareaRef}
          value={texte}
          onChange={e => setTexte(e.target.value.slice(0, MAX))}
          placeholder="Quoi de neuf à Ganges ?"
          rows={8}
          className="block w-full resize-none bg-transparent text-[15.5px] leading-[1.5] text-texte outline-none placeholder:text-texte-tres-doux"
          style={{ colorScheme: 'light', minHeight: 200 }}
          disabled={posting}
        />

        {/* Preview embed sélectionné */}
        {embed && <EmbedPreview embed={embed} onRemove={() => setEmbed(null)} />}

        {/* Preview médias (photos / youtube / lien) */}
        {media.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {media.map((m, i) => (
              <div key={i} className="relative">
                <button type="button" onClick={() => removeMedia(i)} aria-label="Retirer"
                  className="absolute -right-2 -top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-[#DC2626] text-white"
                  style={{ fontSize: 12, lineHeight: 1 }}>×</button>
                {m.t === 'photo' && <img src={m.url} alt="" className="h-[72px] w-[72px] rounded-[10px] object-cover" />}
                {m.t === 'youtube' && (
                  <div className="relative h-[72px] w-[110px] overflow-hidden rounded-[10px] bg-black">
                    <img src={youtubeThumb(m.id)} alt="" className="h-full w-full object-cover opacity-80" />
                    <span className="absolute inset-0 flex items-center justify-center">
                      <svg width={20} height={20} viewBox="0 0 24 24" fill="#fff"><polygon points="8 5 19 12 8 19 8 5" /></svg>
                    </span>
                  </div>
                )}
                {m.t === 'link' && (
                  <div className="flex h-[72px] w-[170px] items-center gap-2 overflow-hidden rounded-[10px] border bg-cremeDeep px-2" style={{ borderColor: '#E8E0D4' }}>
                    {m.image
                      ? <img src={m.image} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
                      : <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-bord text-texte-doux">
                          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                        </div>}
                    <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-texte">{m.title ?? m.url}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Champ lien (toggle) */}
        {linkOpen && (
          <div className="mt-3 flex gap-2">
            <input
              type="url" value={linkInput} autoFocus
              onChange={e => setLinkInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddLink() } }}
              placeholder="Colle un lien (YouTube, article…)"
              className="flex-1 rounded-[12px] border px-3 py-2 text-[13px] outline-none"
              style={{ borderColor: '#E8E0D4', backgroundColor: '#FBF7F0', colorScheme: 'light' }}
            />
            <button type="button" onClick={handleAddLink} disabled={fetchingLink}
              className="rounded-[12px] bg-primary px-3.5 text-[12px] font-bold text-white disabled:opacity-50">
              {fetchingLink ? '…' : 'Ajouter'}
            </button>
          </div>
        )}

        {/* Actions */}
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading || photoCount >= MAX_PHOTOS}
              className="inline-flex items-center gap-1.5 rounded-full bg-cremeDeep px-3 py-1.5 text-[11.5px] font-extrabold text-primary disabled:opacity-50">
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
              {uploading ? '…' : 'Photo'}
            </button>
            <button type="button" onClick={() => setLinkOpen(o => !o)}
              className="inline-flex items-center gap-1.5 rounded-full bg-cremeDeep px-3 py-1.5 text-[11.5px] font-extrabold text-primary">
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
              Lien
            </button>
            <button type="button" onClick={() => setPickerOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-cremeDeep px-3 py-1.5 text-[11.5px] font-extrabold text-primary">
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              {embed ? 'Changer' : 'Élément'}
            </button>
          </div>
          <div className="shrink-0 text-[11px] text-texte-tres-doux">{texte.length}/{MAX}</div>
        </div>

        <input ref={fileRef} type="file" accept="image/*" multiple onChange={handlePickPhotos} style={{ display: 'none' }} />

        {/* Broadcast admin — visible seulement pour les admins */}
        {isAdmin && (
          <div className="mt-4 rounded-[14px] border bg-cremeDeep px-3 py-3" style={{ borderColor: '#E8E0D4' }}>
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.06em] text-primary">
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 11l18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
              </svg>
              Notifier à la publication
            </div>
            <div className="flex flex-wrap gap-1.5">
              {NOTIFY_OPTIONS.map(o => {
                const active = notify === o.value
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setNotify(o.value)}
                    className="rounded-full px-3 py-1.5 text-[12px] font-bold"
                    style={{
                      backgroundColor: active ? 'var(--primary)' : '#fff',
                      color:           active ? '#fff' : '#7A6A5A',
                      border:          active ? 'none' : '1px solid #E8E0D4',
                    }}
                  >
                    {o.label}
                  </button>
                )
              })}
            </div>
            {notify !== 'none' && (
              <p className="m-0 mt-2 text-[10.5px] text-texte-doux">
                Une notification sera envoyée {notify === 'all'
                  ? 'à tout le village'
                  : `aux « ${NOTIFY_OPTIONS.find(o => o.value === notify)?.label} »`} dès la publication.
              </p>
            )}
          </div>
        )}
      </div>

      {pickerOpen && (
        <EmbedPicker
          onSelect={item => { setEmbed(item); setPickerOpen(false) }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
    </ClientPortal>
  )
}

/* ── Preview embed inline dans le composer ──────────────────────────── */
function EmbedPreview({ embed, onRemove }: { embed: EmbedItem; onRemove: () => void }) {
  const labels: Record<EmbedItem['kind'], string> = {
    event: 'Événement', etab: 'Établissement', producer: 'Producteur',
    annonce: 'Annonce', promo: 'Promotion', covoit: 'Covoiturage',
  }
  return (
    <div
      className="mt-3 flex items-center gap-2.5 rounded-[12px] border bg-cremeDeep px-2.5 py-2"
      style={{ borderColor: '#E8E0D4' }}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-primary-light text-primary">
        {embed.photo
          ? <img src={embed.photo} alt="" className="h-full w-full object-cover" />
          : <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/></svg>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[9.5px] font-extrabold uppercase text-primary" style={{ letterSpacing: '0.08em' }}>
          {labels[embed.kind]}
        </div>
        <div className="truncate text-[13px] font-bold text-texte" style={{ letterSpacing: '-0.005em' }}>
          {embed.title}
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Retirer le lien"
        className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-texte-doux"
        style={{ border: '1px solid #E8E0D4' }}
      >
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}

function VisibilityPicker({ value, onChange }: { value: Visibility; onChange: (v: Visibility) => void }) {
  const [open, setOpen] = useState(false)
  const current = VIS_OPTIONS.find(o => o.value === value)!

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1 rounded-full border bg-white px-2 py-[3px] text-[10.5px] font-bold text-texte-doux"
        style={{ borderColor: '#E8E0D4' }}
      >
        <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          {value === 'public' && <><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></>}
          {value === 'amis'   && <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></>}
          {value === 'prive'  && <><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>}
        </svg>
        {current.label}
        <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[3600]" onClick={() => setOpen(false)} aria-hidden />
          <div
            className="absolute left-0 top-full z-[3700] mt-1 w-[240px] overflow-hidden rounded-[12px] border bg-white"
            style={{ borderColor: '#E8E0D4', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
          >
            {VIS_OPTIONS.map((o, i) => {
              const active = o.value === value
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => { onChange(o.value); setOpen(false) }}
                  className="flex w-full items-start gap-2.5 bg-transparent px-3 py-2.5 text-left"
                  style={{ borderTop: i > 0 ? '1px solid #F0EAE0' : undefined }}
                >
                  <div
                    className="mt-0.5 inline-block h-3 w-3 shrink-0 rounded-full"
                    style={{ background: active ? '#2D5A3D' : '#F0EAE0' }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-extrabold text-texte" style={{ letterSpacing: '-0.005em' }}>
                      {o.label}
                    </div>
                    <div className="text-[10.5px] text-texte-doux">{o.sub}</div>
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
