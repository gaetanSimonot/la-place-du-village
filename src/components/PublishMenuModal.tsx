'use client'
import { useEffect } from 'react'

interface PublishOption {
  id:    'event' | 'annonce' | 'commerce'
  title: string
  sub:   string
  tint:  string
  color: string
  icon:  React.ReactNode
}

const OPTIONS: PublishOption[] = [
  {
    id: 'event', title: 'Un événement', sub: "Photo d'affiche ou dictée vocale",
    tint: '#E8F2EB', color: '#2D5A3D',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
  },
  {
    id: 'annonce', title: 'Une annonce', sub: 'Vente, don, troc, enchère',
    tint: '#FFF0E5', color: '#C84B2F',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.59 13.41L13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
        <line x1="7" y1="7" x2="7.01" y2="7"/>
      </svg>
    ),
  },
  {
    id: 'commerce', title: 'Référencer un commerce ou producteur', sub: 'Restaurant, artisan, ferme…',
    tint: '#F0EBE3', color: '#7C5C3B',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l1-5h16l1 5"/>
        <path d="M4 9v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/>
        <path d="M9 21V12h6v9"/>
      </svg>
    ),
  },
]

interface Props {
  open:   boolean
  onClose:() => void
  onPick: (id: PublishOption['id']) => void
}

export default function PublishMenuModal({ open, onClose, onPick }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[3000] flex items-end justify-center bg-black/55 backdrop-blur-[3px] font-inter"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-[480px] rounded-t-3xl bg-white px-4 pb-7 pt-3.5"
        style={{ paddingBottom: 'max(28px, env(safe-area-inset-bottom, 28px))' }}
      >
        <div className="mx-auto mb-3.5 h-[5px] w-11 rounded-[3px] bg-[#E4DED2]" />

        <h2
          className="m-0 mb-1 font-serif text-[22px] font-normal text-texte"
          style={{ letterSpacing: '-0.01em' }}
        >
          Que voulez-vous publier ?
        </h2>
        <p className="m-0 mb-4 text-[13px] text-texte-doux">
          Tout est gratuit et visible immédiatement par le village.
        </p>

        <div className="flex flex-col gap-2">
          {OPTIONS.map(o => (
            <button
              key={o.id}
              onClick={() => onPick(o.id)}
              className="flex w-full items-center gap-3.5 rounded-2xl border bg-white px-3.5 py-3 text-left shadow-[0_1px_4px_rgba(44,28,16,0.04)]"
              style={{ borderColor: '#F0EAE0' }}
            >
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: o.tint, color: o.color }}
              >
                {o.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-extrabold leading-tight text-texte">{o.title}</div>
                <div className="mt-0.5 text-[11px] text-texte-doux">{o.sub}</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-texte-tres-doux">
                <polyline points="9 6 15 12 9 18"/>
              </svg>
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          className="mt-3.5 w-full rounded-2xl border-none bg-cremeDeep py-3 text-[13px] font-bold text-texte-doux"
        >
          Annuler
        </button>
      </div>
    </div>
  )
}
