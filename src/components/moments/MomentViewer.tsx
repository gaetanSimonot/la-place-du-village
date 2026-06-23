'use client'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { shareLink } from '@/lib/share'
import FollowButton from '@/components/FollowButton'
import { momentAge, type Moment, type MomentCommentaire } from '@/lib/moments'

interface Props {
  moments: Moment[]
  startIndex: number
  onClose: () => void
  onDeleted?: (id: string) => void
  onViewed?: (id: string) => void
  /** Si fourni, le bouton haut-gauche affiche « ‹ <backLabel> » (ex: « Voir tout »)
   *  au lieu de la croix. Dans les deux cas l'action est onClose. */
  backLabel?: string
}

const PHOTO_SEC = 5

/**
 * Fil vertical type TikTok : une vidéo par "page", scroll-snap vertical,
 * autoplay de la slide visible, avance auto à la fin, tap = pause/play +
 * timeline, ✕ en haut à gauche, infos auteur + commentaires en bas.
 */
export default function MomentViewer({ moments, startIndex, onClose, onDeleted, onViewed, backLabel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const slideRefs = useRef<(HTMLDivElement | null)[]>([])
  const [items, setItems] = useState(moments)
  const [commentsFor, setCommentsFor] = useState<string | null>(null)

  // Positionne sur la slide de départ au montage (sans animation)
  useEffect(() => {
    const el = slideRefs.current[startIndex]
    if (el) el.scrollIntoView({ behavior: 'auto' })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const goToIndex = (i: number) => {
    const el = slideRefs.current[i]
    if (el) el.scrollIntoView({ behavior: 'smooth' })
  }

  const removeLocal = (id: string) => {
    setItems(list => list.filter(m => m.id !== id))
    onDeleted?.(id)
  }

  if (typeof document === 'undefined') return null
  if (items.length === 0) { onClose(); return null }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 1300, background: '#000', fontFamily: 'Inter, sans-serif' }}>
      <style>{`.reel-scroll::-webkit-scrollbar{display:none}`}</style>

      {/* Haut-gauche : « ‹ Voir tout » (depuis l'accueil) ou la croix (ailleurs) */}
      {backLabel ? (
        <button onClick={onClose} aria-label={backLabel}
          style={{ position: 'absolute', top: 'max(14px,env(safe-area-inset-top,14px))', left: 12, zIndex: 30, display: 'inline-flex', alignItems: 'center', gap: 5, height: 38, padding: '0 14px 0 11px', borderRadius: 999, background: 'rgba(0,0,0,0.45)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          {backLabel}
        </button>
      ) : (
        <button onClick={onClose} aria-label="Fermer"
          style={{ position: 'absolute', top: 'max(14px,env(safe-area-inset-top,14px))', left: 12, zIndex: 30, width: 38, height: 38, borderRadius: '50%', background: 'rgba(0,0,0,0.4)', border: 'none', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      )}

      <div ref={containerRef} className="reel-scroll"
        style={{ height: '100dvh', overflowY: 'scroll', scrollSnapType: 'y mandatory', msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
        {items.map((m, i) => (
          <div key={m.id} ref={el => { slideRefs.current[i] = el }}
            style={{ height: '100dvh', scrollSnapAlign: 'start', position: 'relative' }}>
            <ReelSlide
              moment={m}
              containerRef={containerRef}
              onEnded={() => goToIndex(i + 1)}
              onActive={() => onViewed?.(m.id)}
              onOpenComments={() => setCommentsFor(m.id)}
              onDeleted={() => removeLocal(m.id)}
            />
          </div>
        ))}
        {/* Sentinelle : scroller en bas du dernier reel → fermeture (retour) */}
        <SentinelSlide containerRef={containerRef} onReach={onClose} label={backLabel ? `‹ ${backLabel}` : 'Fin'} />
      </div>

      {commentsFor && (
        <MomentComments
          momentId={commentsFor}
          onClose={() => setCommentsFor(null)}
        />
      )}
    </div>,
    document.body,
  )
}

// ── Sentinelle de fin de fil ────────────────────────────────────────────────
function SentinelSlide({ containerRef, onReach, label }: { containerRef: React.RefObject<HTMLDivElement>; onReach: () => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current, root = containerRef.current
    if (!el || !root) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting && e.intersectionRatio >= 0.6) onReach() }, { root, threshold: [0, 0.6, 1] })
    obs.observe(el)
    return () => obs.disconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef])
  return (
    <div ref={ref} style={{ height: '100dvh', scrollSnapAlign: 'start', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.45)', fontSize: 13, fontWeight: 700 }}>
      {label}
    </div>
  )
}

// ── Une slide ───────────────────────────────────────────────────────────────
function ReelSlide({
  moment: m, containerRef, onEnded, onActive, onOpenComments, onDeleted,
}: {
  moment: Moment
  containerRef: React.RefObject<HTMLDivElement>
  onEnded: () => void
  onActive: () => void
  onOpenComments: () => void
  onDeleted: () => void
}) {
  const router = useRouter()
  const { user, isAdmin } = useAuth()
  const rootRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const photoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [active, setActive] = useState(false)
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState(0)   // 0→1
  const [scrubVisible, setScrubVisible] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [liked, setLiked] = useState(m.liked)
  const [likes, setLikes] = useState(m.likes)
  const scrubHideT = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Détecte quand la slide est visible (≥60%) → devient active
  useEffect(() => {
    const el = rootRef.current
    const root = containerRef.current
    if (!el || !root) return
    const obs = new IntersectionObserver(
      ([e]) => setActive(e.isIntersecting && e.intersectionRatio >= 0.6),
      { root, threshold: [0, 0.6, 1] },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [containerRef])

  // Pilote la lecture selon active/paused
  useEffect(() => {
    const v = videoRef.current
    if (active) {
      onActive()
      // marque "vu" côté serveur (best-effort)
      if (user) supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.access_token) fetch(`/api/moments/${m.id}/vue`, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } }).catch(() => {})
      })
      setPaused(false)
      if (m.media_kind === 'video' && v) {
        v.currentTime = 0
        v.muted = false
        v.play().catch(() => { v.muted = true; v.play().catch(() => {}) })
      } else {
        // photo : avance auto après PHOTO_SEC
        setProgress(0)
        const start = Date.now()
        const tick = () => { setProgress(Math.min(1, (Date.now() - start) / (PHOTO_SEC * 1000))) }
        const iv = setInterval(tick, 100)
        photoTimer.current = setTimeout(() => { clearInterval(iv); onEnded() }, PHOTO_SEC * 1000)
        return () => { clearInterval(iv); if (photoTimer.current) clearTimeout(photoTimer.current) }
      }
    } else {
      if (v) v.pause()
      if (photoTimer.current) clearTimeout(photoTimer.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  const onTimeUpdate = () => {
    const v = videoRef.current
    if (v && v.duration) setProgress(v.currentTime / v.duration)
  }

  const togglePlay = () => {
    const v = videoRef.current
    if (m.media_kind === 'video' && v) {
      if (v.paused) { v.play().catch(() => {}); setPaused(false) }
      else { v.pause(); setPaused(true) }
    } else {
      setPaused(p => !p)   // photo : fige la barre (purement visuel)
    }
    // montre la timeline un instant
    setScrubVisible(true)
    if (scrubHideT.current) clearTimeout(scrubHideT.current)
    scrubHideT.current = setTimeout(() => setScrubVisible(false), 2500)
  }

  const seek = (clientX: number, el: HTMLDivElement) => {
    const v = videoRef.current
    if (!v || !v.duration) return
    const rect = el.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    v.currentTime = ratio * v.duration
    setProgress(ratio)
    setScrubVisible(true)
  }

  const toggleLike = async () => {
    if (!user) { toast('Connecte-toi pour réagir'); return }
    const next = !liked
    setLiked(next); setLikes(n => n + (next ? 1 : -1))
    const { data: { session } } = await supabase.auth.getSession()
    const r = await fetch(`/api/moments/${m.id}/like`, { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token}` } }).catch(() => null)
    if (r && r.ok) { const d = await r.json(); setLiked(d.liked); setLikes(d.likes) }
  }

  const share = () => shareLink({ title: 'En ce moment', text: m.legende ?? 'Un moment sur La Place du Village', url: `${typeof window !== 'undefined' ? window.location.origin : ''}/en-ce-moment?m=${m.id}` })

  const openAuthor = () => router.push(`/profil/${m.auteur_id}?tab=reels`)

  const del = async () => {
    if (!confirm('Supprimer ce moment ?')) return
    const { data: { session } } = await supabase.auth.getSession()
    const r = await fetch(`/api/moments/${m.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${session?.access_token}` } })
    if (!r.ok) { toast.error('Suppression échouée'); return }
    toast.success('Supprimé'); onDeleted()
  }

  const canDelete = isAdmin || (user && user.id === m.auteur_id)

  return (
    <div ref={rootRef} style={{ position: 'absolute', inset: 0, background: '#0D0906' }}>
      {/* média */}
      {m.media_kind === 'video' ? (
        <video ref={videoRef} src={m.media_url} playsInline loop={false} onEnded={onEnded} onTimeUpdate={onTimeUpdate}
          onClick={togglePlay}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={m.media_url} alt="" onClick={togglePlay} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      )}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, transparent 18%, transparent 52%, rgba(0,0,0,0.85) 100%)' }} />

      {/* play au centre si en pause */}
      {paused && (
        <div onClick={togglePlay} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 70, height: 70, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 6 }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="#fff"><polygon points="6 4 20 12 6 20 6 4"/></svg>
        </div>
      )}

      {/* actions verticales droite */}
      <div style={{ position: 'absolute', right: 12, bottom: 150, zIndex: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, color: '#fff' }}>
        <button onClick={toggleLike} style={iconBtn}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill={liked ? '#E8622A' : 'none'} stroke={liked ? '#E8622A' : '#fff'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          <span style={iconLbl}>{likes}</span>
        </button>
        <button onClick={onOpenComments} style={iconBtn}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
          <span style={iconLbl}>{m.comments}</span>
        </button>
        <button onClick={share} style={iconBtn}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        </button>
        {canDelete && (
          <button onClick={() => setMenuOpen(o => !o)} style={iconBtn}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="#fff"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>
          </button>
        )}
      </div>
      {menuOpen && canDelete && (
        <div style={{ position: 'absolute', right: 12, bottom: 110, zIndex: 9, background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
          <button onClick={del} style={{ display: 'block', padding: '11px 18px', background: 'none', border: 'none', color: '#C0392B', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Supprimer</button>
        </div>
      )}

      {/* bas : auteur + suivre + légende + commentaires */}
      <div style={{ position: 'absolute', left: 14, right: 76, bottom: 'max(20px,env(safe-area-inset-bottom,20px))', zIndex: 8, color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={openAuthor} style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 'none', padding: 0, cursor: 'pointer', minWidth: 0 }}>
            <span style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', border: '2px solid #fff', background: '#A85138', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff' }}>
              {m.auteur_avatar
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={m.auteur_avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : (m.auteur_nom?.[0]?.toUpperCase() ?? '?')}
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.auteur_nom}</span>
              <span style={{ display: 'block', fontSize: 10.5, opacity: 0.8 }}>il y a {momentAge(m.created_at)}{m.cible ? ` · 📍 ${m.cible.nom}` : ''}</span>
            </span>
          </button>
          <FollowButton targetUserId={m.auteur_id} dark />
        </div>
        {m.legende && <div style={{ marginTop: 10, fontSize: 13.5, lineHeight: 1.4, maxHeight: 60, overflow: 'hidden' }}>{m.legende}</div>}
        <button onClick={onOpenComments} style={{ marginTop: 8, background: 'none', border: 'none', padding: 0, color: 'rgba(255,255,255,0.85)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
          {m.comments > 0 ? `Voir les ${m.comments} commentaire${m.comments > 1 ? 's' : ''}` : 'Ajouter un commentaire…'}
        </button>
        {(m.cible?.type === 'evenement' || m.cible?.type === 'etablissement') && (
          <button onClick={() => router.push(m.cible!.type === 'evenement' ? `/evenement/${m.cible!.id}` : `/etablissement/${m.cible!.id}`)}
            style={{ marginTop: 10, padding: '8px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.16)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            Voir la fiche →
          </button>
        )}
      </div>

      {/* timeline / scrubber (vidéo) */}
      {m.media_kind === 'video' && (
        <div
          onClick={e => { e.stopPropagation(); seek(e.clientX, e.currentTarget) }}
          onTouchStart={e => e.stopPropagation()}
          onTouchMove={e => { e.stopPropagation(); seek(e.touches[0].clientX, e.currentTarget) }}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 9, padding: scrubVisible ? '14px 12px' : '0', cursor: 'pointer' }}>
          <div style={{ height: scrubVisible ? 5 : 2.5, borderRadius: 3, background: 'rgba(255,255,255,0.3)', transition: 'height 0.15s' }}>
            <div style={{ height: '100%', width: `${progress * 100}%`, background: '#fff', borderRadius: 3 }} />
          </div>
        </div>
      )}
      {m.media_kind === 'photo' && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2.5, background: 'rgba(255,255,255,0.3)', zIndex: 9 }}>
          <div style={{ height: '100%', width: `${progress * 100}%`, background: '#fff' }} />
        </div>
      )}
    </div>
  )
}

const iconBtn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, color: '#fff', padding: 0 }
const iconLbl: React.CSSProperties = { fontSize: 11, fontWeight: 700 }

// ── Feuille commentaires (façon Facebook, glisse du bas) ────────────────────
function MomentComments({ momentId, onClose }: { momentId: string; onClose: () => void }) {
  const { user } = useAuth()
  const [list, setList] = useState<MomentCommentaire[]>([])
  const [texte, setTexte] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch(`/api/moments/${momentId}/commentaires`).then(r => r.json()).then(d => setList(d.commentaires ?? [])).catch(() => {})
  }, [momentId])

  const submit = async () => {
    const t = texte.trim()
    if (!t) return
    if (!user) { toast('Connecte-toi pour commenter'); return }
    setBusy(true)
    const { data: { session } } = await supabase.auth.getSession()
    const r = await fetch(`/api/moments/${momentId}/commentaires`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify({ texte: t }) })
    setBusy(false)
    if (!r.ok) { toast.error('Échec'); return }
    const d = await r.json()
    setList(l => [...l, d.commentaire]); setTexte('')
  }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 1400, fontFamily: 'Inter, sans-serif' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: '72vh', background: '#FBFAF7', borderRadius: '20px 20px 0 0', display: 'flex', flexDirection: 'column', paddingBottom: 'max(12px,env(safe-area-inset-bottom,12px))' }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: '#D1CCC4', margin: '12px auto 8px' }} />
        <p style={{ margin: '0 0 8px', textAlign: 'center', fontWeight: 800, fontSize: 14, color: '#1A1209' }}>Commentaires</p>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.length === 0 && <p style={{ textAlign: 'center', color: '#9A8A7A', fontSize: 13, padding: '20px 0' }}>Sois le premier à commenter</p>}
          {list.map(c => (
            <div key={c.id} style={{ fontSize: 13.5, color: '#2C2C2C', lineHeight: 1.4 }}>
              <b style={{ color: '#1A1209' }}>{c.auteur_nom ?? 'Membre'}</b> {c.texte}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, padding: '10px 16px 0' }}>
          <input value={texte} onChange={e => setTexte(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit() }} placeholder="Ajoute un commentaire…" maxLength={500}
            style={{ flex: 1, padding: '11px 14px', borderRadius: 999, border: '1px solid #E5DDD2', fontSize: 14, outline: 'none' }} />
          <button onClick={submit} disabled={busy || !texte.trim()} style={{ padding: '0 18px', borderRadius: 999, border: 'none', background: '#E8622A', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer', opacity: busy || !texte.trim() ? 0.5 : 1 }}>Envoyer</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
