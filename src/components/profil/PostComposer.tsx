'use client'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import ClientPortal from '@/components/ClientPortal'

export type Visibility = 'public' | 'amis' | 'prive'

interface Props {
  authorName:   string
  authorAvatar: string | null
  onClose:      () => void
  onPosted:     () => void
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
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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
    if (posting) return
    const trimmed = texte.trim()
    if (trimmed.length === 0) return
    setPosting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Session expirée')

      const res = await fetch('/api/posts', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ texte: trimmed, visibility }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Erreur publication')
      }
      onPosted()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
      setPosting(false)
    }
  }

  const initial = (authorName || '·').trim().charAt(0).toUpperCase() || '·'
  const canSend = texte.trim().length > 0 && !posting

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

        <div className="mt-2 text-right text-[11px] text-texte-tres-doux">
          {texte.length}/{MAX}
        </div>
      </div>
    </div>
    </ClientPortal>
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
