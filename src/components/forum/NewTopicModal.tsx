'use client'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import ClientPortal from '@/components/ClientPortal'
import { compressAndUpload } from '@/lib/clientUpload'
import { type MediaItem, MAX_PHOTOS } from '@/lib/postMedia'
import { MAX_POLL_OPTIONS } from '@/lib/forum'

export default function NewTopicModal({ onClose, onCreated }: {
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [titre, setTitre]       = useState('')
  const [corps, setCorps]       = useState('')
  const [media, setMedia]       = useState<MediaItem[]>([])
  const [uploading, setUploading] = useState(false)
  const [posting, setPosting]   = useState(false)
  const [pollOpen, setPollOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [options, setOptions]   = useState<string[]>(['', ''])
  const fileRef = useRef<HTMLInputElement>(null)
  const photoCount = media.filter(m => m.t === 'photo').length

  async function pickPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    const slots = MAX_PHOTOS - photoCount
    if (slots <= 0) { toast.error(`Maximum ${MAX_PHOTOS} photos`); return }
    setUploading(true)
    try {
      for (const file of files.slice(0, slots)) {
        const { publicUrl } = await compressAndUpload(file, { kind: 'post-media' })
        setMedia(prev => [...prev, { t: 'photo', url: publicUrl }])
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Échec upload')
    } finally { setUploading(false) }
  }

  const validOptions = options.map(o => o.trim()).filter(Boolean)
  const pollValid = pollOpen && question.trim().length > 0 && validOptions.length >= 2
  const canPost = titre.trim().length > 0 && !posting && !uploading

  async function publish() {
    if (!canPost) return
    setPosting(true)
    const poll = pollValid ? { question: question.trim(), options: validOptions } : null
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/forum/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ titre: titre.trim(), corps: corps.trim() || null, media, poll }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Erreur')
      onCreated(d.id as string)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
      setPosting(false)
    }
  }

  return (
    <ClientPortal>
      <div className="fixed inset-0 z-[3500] flex flex-col bg-creme font-inter text-texte" role="dialog" aria-modal="true">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-2.5" style={{ borderBottom: '1px solid #F0EAE0', paddingTop: 'max(10px, env(safe-area-inset-top, 10px))' }}>
          <button type="button" onClick={onClose} disabled={posting} className="-ml-2 flex h-10 w-10 items-center justify-center bg-transparent text-texte disabled:opacity-60" aria-label="Fermer">
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <div className="flex-1 truncate text-center font-serif text-[17px]" style={{ letterSpacing: '-0.005em' }}>Nouveau sujet</div>
          <button type="button" onClick={publish} disabled={!canPost} className="rounded-full bg-primary px-3.5 py-[7px] text-[12px] font-extrabold text-white disabled:opacity-50">
            {posting ? '…' : 'Publier'}
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 pt-4">
          <input
            value={titre}
            onChange={e => setTitre(e.target.value.slice(0, 200))}
            placeholder="Titre du sujet"
            className="block w-full bg-transparent font-serif text-[20px] text-texte outline-none placeholder:text-texte-tres-doux"
            style={{ letterSpacing: '-0.01em' }}
          />
          <textarea
            value={corps}
            onChange={e => setCorps(e.target.value.slice(0, 5000))}
            placeholder="Développe ton sujet… (optionnel)"
            rows={6}
            className="mt-3 block w-full resize-none bg-transparent text-[15px] leading-[1.5] text-texte outline-none placeholder:text-texte-tres-doux"
            style={{ colorScheme: 'light', minHeight: 140 }}
          />

          {/* Photos */}
          {media.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {media.map((m, i) => m.t === 'photo' ? (
                <div key={i} className="relative">
                  <button type="button" onClick={() => setMedia(prev => prev.filter((_, j) => j !== i))} className="absolute -right-2 -top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-[#DC2626] text-white" style={{ fontSize: 12, lineHeight: 1 }}>×</button>
                  <img src={m.url} alt="" className="h-[72px] w-[72px] rounded-[10px] object-cover" />
                </div>
              ) : null)}
            </div>
          )}

          {/* Sondage */}
          {pollOpen && (
            <div className="mt-4 rounded-[14px] border bg-cremeDeep p-3" style={{ borderColor: '#E8E0D4' }}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[12px] font-extrabold text-primary">Sondage</span>
                <button type="button" onClick={() => setPollOpen(false)} className="text-[11px] font-bold text-texte-doux underline">Retirer</button>
              </div>
              <input value={question} onChange={e => setQuestion(e.target.value.slice(0, 200))} placeholder="Ta question…" className="mb-2 block w-full rounded-[10px] border px-3 py-2 text-[13px] outline-none" style={{ borderColor: '#E8E0D4', background: '#fff', colorScheme: 'light' }} />
              <div className="flex flex-col gap-1.5">
                {options.map((o, i) => (
                  <input key={i} value={o} onChange={e => setOptions(prev => prev.map((x, j) => j === i ? e.target.value.slice(0, 100) : x))} placeholder={`Choix ${i + 1}`} className="block w-full rounded-[10px] border px-3 py-2 text-[13px] outline-none" style={{ borderColor: '#E8E0D4', background: '#fff', colorScheme: 'light' }} />
                ))}
              </div>
              {options.length < MAX_POLL_OPTIONS && (
                <button type="button" onClick={() => setOptions(prev => [...prev, ''])} className="mt-2 text-[12px] font-bold text-primary">+ Ajouter un choix</button>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="mt-4 flex flex-wrap gap-1.5 pb-8">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading || photoCount >= MAX_PHOTOS} className="inline-flex items-center gap-1.5 rounded-full bg-cremeDeep px-3 py-1.5 text-[11.5px] font-extrabold text-primary disabled:opacity-50">
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              {uploading ? '…' : 'Photo'}
            </button>
            {!pollOpen && (
              <button type="button" onClick={() => setPollOpen(true)} className="inline-flex items-center gap-1.5 rounded-full bg-cremeDeep px-3 py-1.5 text-[11.5px] font-extrabold text-primary">
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                Sondage
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={pickPhotos} style={{ display: 'none' }} />
        </div>
      </div>
    </ClientPortal>
  )
}
