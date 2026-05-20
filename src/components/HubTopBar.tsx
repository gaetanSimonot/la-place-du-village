'use client'

interface Props {
  onOpenMenu?:    () => void
  /** @deprecated Les notifs sont désormais accessibles via la bottom nav (icône cloche). */
  onOpenNotifs?:  () => void
  onOpenZone?:    () => void
  zoneLabel?:     string
  /** @deprecated le badge notif est maintenant sur la bottom nav */
  unreadCount?:   number
}

export default function HubTopBar({
  onOpenMenu, onOpenZone,
  zoneLabel = 'Ganges et alentours',
}: Props) {
  return (
    <div className="flex items-center justify-between gap-2.5 px-4 pt-3.5">
      {/* Burger gauche */}
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Menu"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-bord bg-white text-texte shadow-[0_1px_2px_rgba(44,28,16,0.04)]"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="7" x2="20" y2="7"/>
          <line x1="4" y1="12" x2="20" y2="12"/>
          <line x1="4" y1="17" x2="14" y2="17"/>
        </svg>
      </button>

      {/* Wordmark + commune */}
      <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
        <div
          className="font-serif text-[18px] leading-none text-primary"
          style={{ letterSpacing: '-0.01em' }}
        >
          La Place du Village
        </div>
        <button
          type="button"
          onClick={onOpenZone}
          className="flex items-center gap-1 bg-transparent p-0 text-[11px] font-semibold text-texte-doux"
          aria-label="Ma zone"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s-7-7.5-7-12a7 7 0 0 1 14 0c0 4.5-7 12-7 12z"/>
            <circle cx="12" cy="10" r="2.5"/>
          </svg>
          <span className="truncate">{zoneLabel}</span>
        </button>
      </div>

      {/* Spacer droit (symétrie avec le burger) — la cloche notifs est
          maintenant dans la bottom nav. */}
      <div className="h-10 w-10 shrink-0" aria-hidden />
    </div>
  )
}
