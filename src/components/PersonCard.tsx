'use client'
import Link from 'next/link'

export interface PersonCardData {
  user_id: string
  display_name: string | null
  avatar_url: string | null
  ville?: string | null
  genre?: 'homme' | 'femme' | 'autre' | null
  is_verified?: boolean
}

function Avatar({ name, url, size = 44 }: { name: string | null; url: string | null; size?: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  }
  const initial = (name || '?')[0]?.toUpperCase() ?? '?'
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-primary font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initial}
    </div>
  )
}

export default function PersonCard({ p }: { p: PersonCardData }) {
  const name = p.display_name || 'Anonyme'
  return (
    <Link
      href={`/profil/${p.user_id}`}
      className="flex items-center gap-3 rounded-2xl border border-bord bg-white px-3 py-3 no-underline transition-colors hover:border-bordSoft"
    >
      <Avatar name={p.display_name} url={p.avatar_url} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[14px] font-bold text-texte">{name}</span>
          {p.is_verified && (
            <span
              aria-label="Profil vérifié"
              title="Profil vérifié"
              className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-white"
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </span>
          )}
          {p.genre && (
            <span className="shrink-0 text-[10px] font-medium text-texte-doux">
              · {p.genre === 'homme' ? 'H' : p.genre === 'femme' ? 'F' : 'A'}
            </span>
          )}
        </div>
        {p.ville && (
          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-texte-doux">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s-7-7.5-7-12a7 7 0 0 1 14 0c0 4.5-7 12-7 12z"/><circle cx="12" cy="10" r="2.5"/>
            </svg>
            <span className="truncate">{p.ville}</span>
          </div>
        )}
      </div>

      {/* Chevron (visuel pour suggérer click) */}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B5A99A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
        <polyline points="9 6 15 12 9 18"/>
      </svg>
    </Link>
  )
}
