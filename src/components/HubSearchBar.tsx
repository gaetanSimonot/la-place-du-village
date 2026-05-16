'use client'

interface Props {
  onClick?:     () => void
  placeholder?: string
}

export default function HubSearchBar({
  onClick,
  placeholder = 'Rechercher un événement, commerce…',
}: Props) {
  return (
    <div className="px-4 pt-3.5">
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-2.5 rounded-[14px] border border-bord bg-white px-3.5 py-[11px] text-left shadow-[0_1px_4px_rgba(44,28,16,0.04)]"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-texte">
          <circle cx="11" cy="11" r="7"/>
          <line x1="16.5" y1="16.5" x2="21" y2="21"/>
        </svg>
        <span className="flex-1 truncate text-[14px] text-texte-tres-doux">{placeholder}</span>
      </button>
    </div>
  )
}
