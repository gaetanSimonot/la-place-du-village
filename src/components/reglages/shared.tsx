'use client'
import Link from 'next/link'
import type { DisplaySettings } from '@/contexts/AuthContext'

/* ── Icons SVG inline (line stroke 1.8) ──────────────────────────────── */
export type IconRenderer = (size?: number) => React.ReactNode
function makeIcon(path: React.ReactNode): IconRenderer {
  return function Icon(size = 18) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        {path}
      </svg>
    )
  }
}

export const I = {
  grid:     makeIcon(<><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></>),
  lock:     makeIcon(<><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>),
  image:    makeIcon(<><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></>),
  text:     makeIcon(<><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></>),
  leaf:     makeIcon(<><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19.2 2.96c1.4 9.3-3.6 15.8-8.2 17.04z"/><path d="M2 21c0-3 1.85-5.36 5.08-6"/></>),
  spark:    makeIcon(<><path d="M12 2v6m0 8v6m10-10h-6m-8 0H2m15.071-7.071-4.243 4.243m-5.657 5.657-4.243 4.243M19.071 19.071l-4.243-4.243m-5.657-5.657L4.929 4.929"/></>),
  heart:    makeIcon(<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>),
  chat:     makeIcon(<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>),
  globe:    makeIcon(<><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></>),
  eye:      makeIcon(<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>),
  eyeOff:   makeIcon(<><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.94 18.94 0 0 1 5.16-5.94"/><path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.94 18.94 0 0 1-2.16 3.19"/><path d="M14.12 14.12A3 3 0 0 1 9.88 9.88"/><line x1="1" y1="1" x2="23" y2="23"/></>),
  cal:      makeIcon(<><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>),
  mega:     makeIcon(<><polygon points="3 11 22 2 22 22 3 13"/><line x1="3" y1="11" x2="3" y2="13"/></>),
  gift:     makeIcon(<><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></>),
  shield:   makeIcon(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>),
  slash:    makeIcon(<><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></>),
  doc:      makeIcon(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>),
  logout:   makeIcon(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>),
  chev:     makeIcon(<polyline points="9 6 15 12 9 18"/>),
  sparkSm:  makeIcon(<><path d="M12 2v6m0 8v6m10-10h-6m-8 0H2"/></>),
  store:    makeIcon(<><path d="M3 9l1-5h16l1 5"/><path d="M4 9v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/><path d="M9 21V12h6v9"/></>),
  journal:  makeIcon(<><rect x="2" y="4" width="20" height="16" rx="2" ry="2"/><line x1="6" y1="8" x2="18" y2="8"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="6" y1="16" x2="14" y2="16"/></>),
  group:    makeIcon(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>),
  rocket:   makeIcon(<><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></>),
  trash:    makeIcon(<><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></>),
  power:    makeIcon(<><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></>),
  check:    makeIcon(<polyline points="20 6 9 17 4 12"/>),
  user:     makeIcon(<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>),
}

/* ── Defaults display_settings ─────────────────────────────────────── */
export const DEFAULT_DISPLAY: DisplaySettings = {
  banner: true,
  bio: true,
  fiche_pro: true,
  module_utile: true,
  pages_suivies: false,
  publications: true,
}

/* ── Privacy mapping ───────────────────────────────────────────────── */
export type PrivacyOption = 'public' | 'search_only' | 'masque'

export function deriveCurrentPrivacy(isPublic?: boolean, searchable?: boolean): PrivacyOption {
  if (isPublic === false && searchable === false) return 'masque'
  if (isPublic === false)                          return 'search_only'
  return 'public'
}

/* ── Group card ─────────────────────────────────────────────────── */
export function GroupCard({
  kicker, kickerColor, icon, children,
}: {
  kicker: string
  kickerColor: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section>
      <div
        className="mb-2 flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase"
        style={{ color: kickerColor, letterSpacing: '0.08em' }}
      >
        {icon} {kicker}
      </div>
      <div
        className="overflow-hidden rounded-[16px] border bg-white"
        style={{ borderColor: '#F0EAE0', boxShadow: '0 1px 4px rgba(44,28,16,0.04)' }}
      >
        {children}
      </div>
    </section>
  )
}

/* ── Toggle row ─────────────────────────────────────────────────── */
export function ToggleRow({
  icon, label, sub, checked, onChange, isLast,
}: {
  icon: React.ReactNode
  label: string
  sub?: string
  checked: boolean
  onChange: (v: boolean) => void
  isLast?: boolean
}) {
  return (
    <label
      className="flex w-full items-center gap-3 px-3.5 py-3"
      style={{ borderBottom: isLast ? 'none' : '1px solid #F0EAE0' }}
    >
      <div
        className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px]"
        style={{ background: checked ? '#E8F2EB' : '#F7F1E6', color: checked ? '#2D5A3D' : '#7A6A5A' }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-extrabold text-texte" style={{ letterSpacing: '-0.005em' }}>
          {label}
        </div>
        {sub && <div className="mt-[1px] truncate text-[11px] text-texte-doux">{sub}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
        className="relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors"
        style={{ background: checked ? '#2D5A3D' : '#E8E0D4' }}
      >
        <span
          className="absolute top-0.5 inline-block h-4 w-4 rounded-full bg-white shadow transition-all"
          style={{ left: checked ? '18px' : '2px' }}
        />
      </button>
    </label>
  )
}

/* ── Radio row ──────────────────────────────────────────────────── */
export function RadioRow({
  icon, label, sub, selected, onClick, isLast,
}: {
  icon: React.ReactNode
  label: string
  sub: string
  selected: boolean
  onClick: () => void
  isLast?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 bg-transparent px-3.5 py-3 text-left"
      style={{ borderBottom: isLast ? 'none' : '1px solid #F0EAE0' }}
    >
      <div
        className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px]"
        style={{ background: selected ? '#E8F2EB' : '#F7F1E6', color: selected ? '#2D5A3D' : '#7A6A5A' }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-extrabold text-texte" style={{ letterSpacing: '-0.005em' }}>
          {label}
        </div>
        <div className="mt-[1px] text-[11px] leading-[1.4] text-texte-doux">{sub}</div>
      </div>
      <span
        className="relative inline-block h-[22px] w-[22px] shrink-0 rounded-full"
        style={{ border: `2px solid ${selected ? '#2D5A3D' : '#D6CCB8'}` }}
      >
        {selected && (
          <span
            className="absolute left-1/2 top-1/2 inline-block h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: '#2D5A3D' }}
          />
        )}
      </span>
    </button>
  )
}

/* ── Nav row ────────────────────────────────────────────────────── */
export function NavRow({
  icon, label, sub, onClick, href, badge, danger, isLast,
}: {
  icon: React.ReactNode
  label: string
  sub?: string
  onClick?: () => void
  href?: string
  badge?: string
  danger?: boolean
  isLast?: boolean
}) {
  const body = (
    <>
      <div
        className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px]"
        style={{ background: danger ? '#FBE9E5' : '#F7F1E6', color: danger ? '#B53A22' : '#2D5A3D' }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1 text-left">
        <div className="text-[13px] font-extrabold" style={{ color: danger ? '#B53A22' : '#1A1209', letterSpacing: '-0.005em' }}>
          {label}
        </div>
        {sub && <div className="mt-[1px] truncate text-[11px] text-texte-doux">{sub}</div>}
      </div>
      {badge && (
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-extrabold uppercase"
          style={{ background: '#E8F2EB', color: '#2D5A3D', letterSpacing: '0.08em' }}
        >
          {badge}
        </span>
      )}
      <span className="shrink-0 text-texte-tres-doux">{I.chev(14)}</span>
    </>
  )
  const className = 'flex w-full items-center gap-3 bg-transparent px-3.5 py-3 text-inherit no-underline'
  const style = { borderBottom: isLast ? 'none' : '1px solid #F0EAE0' } as const
  if (href) {
    return <Link href={href} className={className} style={style}>{body}</Link>
  }
  return <button type="button" onClick={onClick} className={className} style={style}>{body}</button>
}
