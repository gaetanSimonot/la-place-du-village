'use client'
import { useEffect, useState } from 'react'
import ClientPortal from '@/components/ClientPortal'
import { type MediaItem, youtubeThumb, youtubeEmbed } from '@/lib/postMedia'

/**
 * Rendu des médias d'un post / message : grille photos (+ lightbox),
 * lecteur YouTube, carte de lien externe (OG). Partagé mur + chat.
 */
export default function PostMedia({ media }: { media: MediaItem[] | null | undefined }) {
  const items = Array.isArray(media) ? media : []
  if (items.length === 0) return null

  const photos = items.filter((m): m is Extract<MediaItem, { t: 'photo' }> => m.t === 'photo')
  const others = items.filter(m => m.t !== 'photo')

  return (
    <div className="flex flex-col gap-2">
      {photos.length > 0 && <PhotoGrid urls={photos.map(p => p.url)} />}
      {others.map((m, i) => {
        if (m.t === 'youtube') return <YouTubeCard key={`yt-${i}`} id={m.id} />
        if (m.t === 'link')    return <LinkCard key={`lk-${i}`} item={m} />
        return null
      })}
    </div>
  )
}

/* ── Grille photos + lightbox ─────────────────────────────────────────── */
function PhotoGrid({ urls }: { urls: string[] }) {
  const [lightbox, setLightbox] = useState<number | null>(null)
  const n = urls.length
  const radius = 12

  const Img = ({ url, idx, style }: { url: string; idx: number; style?: React.CSSProperties }) => (
    <img
      src={url} alt="" loading="lazy"
      onClick={() => setLightbox(idx)}
      style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer', display: 'block', ...style }}
    />
  )

  let grid: React.ReactNode
  if (n === 1) {
    grid = (
      <div style={{ width: '100%', maxHeight: 420, overflow: 'hidden', borderRadius: radius }}>
        <img src={urls[0]} alt="" loading="lazy" onClick={() => setLightbox(0)}
          style={{ width: '100%', maxHeight: 420, objectFit: 'cover', cursor: 'pointer', display: 'block' }} />
      </div>
    )
  } else if (n === 2) {
    grid = (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, borderRadius: radius, overflow: 'hidden' }}>
        {urls.map((u, i) => <div key={i} style={{ aspectRatio: '1 / 1' }}><Img url={u} idx={i} /></div>)}
      </div>
    )
  } else if (n === 3) {
    grid = (
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gridTemplateRows: '1fr 1fr', gap: 3, height: 300, borderRadius: radius, overflow: 'hidden' }}>
        <div style={{ gridRow: '1 / 3' }}><Img url={urls[0]} idx={0} /></div>
        <div><Img url={urls[1]} idx={1} /></div>
        <div><Img url={urls[2]} idx={2} /></div>
      </div>
    )
  } else {
    grid = (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 3, height: 320, borderRadius: radius, overflow: 'hidden' }}>
        {urls.slice(0, 4).map((u, i) => <div key={i}><Img url={u} idx={i} /></div>)}
      </div>
    )
  }

  return (
    <>
      {grid}
      {lightbox !== null && (
        <Lightbox urls={urls} index={lightbox} onClose={() => setLightbox(null)} onIndex={setLightbox} />
      )}
    </>
  )
}

function Lightbox({ urls, index, onClose, onIndex }: {
  urls: string[]; index: number; onClose: () => void; onIndex: (i: number) => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') onIndex((index + 1) % urls.length)
      if (e.key === 'ArrowLeft')  onIndex((index - 1 + urls.length) % urls.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, urls.length, onClose, onIndex])

  return (
    <ClientPortal>
      <div onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <button onClick={onClose} aria-label="Fermer"
          style={{ position: 'absolute', top: 14, right: 14, width: 40, height: 40, borderRadius: 999, background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <img src={urls[index]} alt="" onClick={e => e.stopPropagation()}
          style={{ maxWidth: '94vw', maxHeight: '88vh', objectFit: 'contain', userSelect: 'none' }} />
        {urls.length > 1 && (
          <>
            <NavBtn side="left"  onClick={e => { e.stopPropagation(); onIndex((index - 1 + urls.length) % urls.length) }} />
            <NavBtn side="right" onClick={e => { e.stopPropagation(); onIndex((index + 1) % urls.length) }} />
            <div style={{ position: 'absolute', bottom: 18, left: 0, right: 0, textAlign: 'center', color: '#fff', fontSize: 12, fontWeight: 700, opacity: 0.8 }}>
              {index + 1} / {urls.length}
            </div>
          </>
        )}
      </div>
    </ClientPortal>
  )
}

function NavBtn({ side, onClick }: { side: 'left' | 'right'; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button onClick={onClick} aria-label={side === 'left' ? 'Précédent' : 'Suivant'}
      style={{ position: 'absolute', left: side === 'left' ? 10 : undefined, right: side === 'right' ? 10 : undefined, top: '50%', transform: 'translateY(-50%)', width: 42, height: 42, borderRadius: 999, background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {side === 'left' ? <polyline points="15 18 9 12 15 6"/> : <polyline points="9 18 15 12 9 6"/>}
      </svg>
    </button>
  )
}

/* ── Lecteur YouTube ──────────────────────────────────────────────────── */
function YouTubeCard({ id }: { id: string }) {
  const [play, setPlay] = useState(false)
  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: 12, overflow: 'hidden', background: '#000' }}>
      {play ? (
        <iframe
          src={`${youtubeEmbed(id)}?autoplay=1&rel=0`}
          title="YouTube"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
        />
      ) : (
        <button onClick={() => setPlay(true)} aria-label="Lire la vidéo"
          style={{ position: 'absolute', inset: 0, border: 'none', padding: 0, cursor: 'pointer', background: '#000' }}>
          <img src={youtubeThumb(id)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.92 }} />
          <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 62, height: 44, borderRadius: 12, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width={26} height={26} viewBox="0 0 24 24" fill="#fff"><polygon points="8 5 19 12 8 19 8 5"/></svg>
          </span>
        </button>
      )}
    </div>
  )
}

/* ── Carte de lien externe (OG, style Facebook) ───────────────────────── */
function LinkCard({ item }: { item: Extract<MediaItem, { t: 'link' }> }) {
  let host = ''
  try { host = new URL(item.url).hostname.replace(/^www\./, '') } catch { host = item.url }
  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer"
      className="block overflow-hidden rounded-[12px] border bg-white text-inherit no-underline"
      style={{ borderColor: '#E8E0D4' }}>
      {item.image && (
        <div style={{ width: '100%', aspectRatio: '1.91 / 1', background: '#EFE8DD', overflow: 'hidden' }}>
          <img src={item.image} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )}
      <div style={{ padding: '9px 12px' }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#9A8A78' }}>{host}</div>
        {item.title && <div style={{ fontSize: 13.5, fontWeight: 800, color: '#1A1209', marginTop: 2, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.title}</div>}
        {item.description && <div style={{ fontSize: 11.5, color: '#7A6A5A', marginTop: 3, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.description}</div>}
      </div>
    </a>
  )
}
