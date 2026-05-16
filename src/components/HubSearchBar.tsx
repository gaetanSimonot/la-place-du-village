'use client'

interface Props {
  onClick?:     () => void
  placeholder?: string
}

export default function HubSearchBar({
  onClick,
  placeholder = 'Que cherchez-vous ?',
}: Props) {
  return (
    <div className="px-4 pt-[18px]">
      <div className="flex items-center overflow-hidden rounded-2xl border border-bord bg-white shadow-[0_1px_4px_rgba(44,28,16,0.04)]">
        <button
          type="button"
          onClick={onClick}
          className="flex flex-1 items-center gap-3 px-4 py-[14px] text-left"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-texte">
            <circle cx="11" cy="11" r="7"/>
            <line x1="16.5" y1="16.5" x2="21" y2="21"/>
          </svg>
          <span className="flex-1 truncate text-[15px] font-medium text-texte-tres-doux">{placeholder}</span>
        </button>
        <div className="h-6 w-px shrink-0 bg-bord" aria-hidden />
        <button
          type="button"
          onClick={onClick}
          aria-label="Filtres"
          className="flex h-[50px] w-[50px] shrink-0 items-center justify-center text-texte"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="6" x2="11" y2="6"/>
            <line x1="14" y1="6" x2="20" y2="6"/>
            <line x1="4" y1="12" x2="7" y2="12"/>
            <line x1="10" y1="12" x2="20" y2="12"/>
            <line x1="4" y1="18" x2="14" y2="18"/>
            <line x1="17" y1="18" x2="20" y2="18"/>
            <circle cx="12.5" cy="6" r="2"/>
            <circle cx="8.5" cy="12" r="2"/>
            <circle cx="15.5" cy="18" r="2"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
