'use client'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { shareLink } from '@/lib/share'
import { momentAge, type Moment, type MomentCommentaire } from '@/lib/moments'

interface Props {
  moments: Moment[]
  startIndex: number
  onClose: () => void
  onDeleted?: (id: string) => void
  onViewed?: (id: string) => void
}

const PHOTO_SEC = 5

export default function MomentViewer({ moments, startIndex, onClose, onDeleted, onViewed }: Props) {
  const router = useRouter()
  const { user, isAdmin } = useAuth()
  const [idx, setIdx] = useState(startIndex)
  const [paused, setPaused] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  // État like/compteurs local (copie mutable du moment courant)
  const [likeState, setLikeState] = useState<Record<string, { liked: boolean; likes: number; comments: number }>>({})

  const touchStart = useRef<{ x: number; y: number } | null>(null)

  const m = moments[idx]
  const live = m ? (likeState[m.id] ?? { liked: m.liked, likes: m.likes, comments: m.comments }) : { liked: false, likes: 0, comments: 0 }

  const next = () => { if (idx < moments.length - 1) setIdx(i => i + 1); else onClose() }
  const prev = () => { if (idx > 0) setIdx(i => i - 1) }

  // Marquer "vu" à chaque ouverture de moment
  useEffect(() => {
    if (!m || !user) return
    onViewed?.(m.id)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) return
      fetch(`/api/moments/${m.id}/vue`, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } }).catch(() => {})
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx])

  if (typeof document === 'undefined' || !m) return null

  const dur = m.media_kind === 'video' ? (m.duree_sec ?? 8) : PHOTO_SEC

  const toggleLike = async () => {
    if (!user) { toast('Connecte-toi pour réagir'); return }
    const cur = likeState[m.id] ?? { liked: m.liked, likes: m.likes, comments: m.comments }
    const optimistic = { ...cur, liked: !cur.liked, likes: cur.likes + (cur.liked ? -1 : 1) }
    setLikeState(s => ({ ...s, [m.id]: optimistic }))
    const { data: { session } } = await supabase.auth.getSession()
    const r = await fetch(`/api/moments/${m.id}/like`, { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token}` } }).catch(() => null)
    if (r && r.ok) { const d = await r.json(); setLikeState(s => ({ ...s, [m.id]: { ...optimistic, liked: d.liked, likes: d.likes } })) }
  }

  const share = () => shareLink({ title: 'En ce moment', text: m.legende ?? 'Un moment sur La Place du Village', url: `${typeof window !== 'undefined' ? window.location.origin : ''}/en-ce-moment?m=${m.id}` })

  const openCible = () => {
    if (!m.cible) return
    if (m.cible.type === 'evenement') router.push(`/evenement/${m.cible.id}`)
    else if (m.cible.type === 'etablissement') router.push(`/etablissement/${m.cible.id}`)
  }

  const del = async () => {
    if (!confirm('Supprimer ce moment ?')) return
    const { data: { session } } = await supabase.auth.getSession()
    const r = await fetch(`/api/moments/${m.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${session?.access_token}` } })
    if (!r.ok) { toast.error('Suppression échouée'); return }
    toast.success('Moment supprimé')
    onDeleted?.(m.id)
    onClose()
  }

  const canDelete = isAdmin || (user && user.id === m.auteur_id)

  // Gestes
  const onTouchStart = (e: React.TouchEvent) => { touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return
    const dx = e.changedTouches[0].clientX - touchStart.current.x
    const dy = e.changedTouches[0].clientY - touchStart.current.y
    touchStart.current = null
    if (Math.abs(dy) > 80 && Math.abs(dy) > Math.abs(dx)) {
      if (dy > 0) onClose()              // swipe bas → fermer
      else openCible()                   // swipe haut → ouvrir la fiche
      return
    }
    // tap zones (si pas un swipe horizontal franc)
    if (Math.abs(dx) < 40 && Math.abs(dy) < 40) {
      const x = e.changedTouches[0].clientX
      if (x < window.innerWidth * 0.32) prev(); else next()
    }
  }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 1300, background: '#0D0906', fontFamily: 'Inter, sans-serif', overflow: 'hidden' }}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <style>{`@keyframes momentfill { from { width: 0% } to { width: 100% } }`}</style>

      {/* média */}
      {m.media_kind === 'video' ? (
        <video
          key={m.id} src={m.media_url} autoPlay playsInline onEnded={next}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          ref={el => {
            if (!el) return
            el.muted = false
            if (paused) { el.pause(); return }
            el.play().catch(() => { el.muted = true; el.play().catch(() => {}) })
          }}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={m.media_url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, transparent 22%, transparent 55%, rgba(0,0,0,0.85) 100%)' }} />

      {/* progress bars */}
      <div style={{ position: 'absolute', top: 'max(12px,env(safe-area-inset-top,12px))', left: 12, right: 12, display: 'flex', gap: 4, zIndex: 5 }}>
        {moments.map((_, i) => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.3)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 2, background: '#fff',
              width: i < idx ? '100%' : i === idx ? undefined : '0%',
              animation: i === idx ? `momentfill ${dur}s linear forwards` : undefined,
              animationPlayState: paused ? 'paused' : 'running' }}
              onAnimationEnd={i === idx ? next : undefined} />
          </div>
        ))}
      </div>

      {/* header */}
      <div style={{ position: 'absolute', top: 'calc(max(12px,env(safe-area-inset-top,12px)) + 14px)', left: 12, right: 12, display: 'flex', alignItems: 'center', gap: 10, zIndex: 6 }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.9)', background: '#A85138', flexShrink: 0 }}>
          {m.auteur_avatar && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.auteur_avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
        </div>
        <div style={{ flex: 1, color: '#fff', minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.auteur_nom}</div>
          <div style={{ fontSize: 10.5, opacity: 0.8 }}>il y a {momentAge(m.created_at)}</div>
        </div>
        {canDelete && (
          <button onClick={() => setMenuOpen(o => !o)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>
          </button>
        )}
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {menuOpen && canDelete && (
        <div style={{ position: 'absolute', top: 90, right: 14, zIndex: 8, background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
          <button onClick={del} style={{ display: 'block', padding: '11px 18px', background: 'none', border: 'none', color: '#C0392B', fontSize: 13, fontWeight: 700, cursor: 'pointer', width: '100%', textAlign: 'left' }}>Supprimer</button>
        </div>
      )}

      {/* pause au centre (tap simple via bouton) */}
      <button onClick={() => setPaused(p => !p)} aria-label="Pause/Play"
        style={{ position: 'absolute', top: '44%', left: '50%', transform: 'translate(-50%,-50%)', width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.22)', color: '#fff', display: paused ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center', zIndex: 4, cursor: 'pointer' }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff"><polygon points="6 4 20 12 6 20 6 4"/></svg>
      </button>

      {/* caption + actions */}
      <div style={{ position: 'absolute', left: 14, right: 14, bottom: 'max(24px,env(safe-area-inset-bottom,24px))', zIndex: 5, display: 'flex', alignItems: 'flex-end', gap: 14 }}>
        <div style={{ flex: 1, color: '#fff', minWidth: 0 }}>
          {m.cible && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 8, fontSize: 10, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.16)', backdropFilter: 'blur(6px)', padding: '3px 8px', borderRadius: 999 }}>📍 {m.cible.nom}</div>
          )}
          {m.legende && <div style={{ fontFamily: '"DM Serif Display", Georgia, serif', fontSize: 19, lineHeight: 1.25 }}>{m.legende}</div>}
          {m.cible && (m.cible.type === 'evenement' || m.cible.type === 'etablissement') && (
            <button onClick={openCible} style={{ marginTop: 12, padding: '10px 16px', borderRadius: 999, background: 'rgba(255,255,255,0.16)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              Voir la fiche <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/></svg>
            </button>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, color: '#fff' }}>
          <button onClick={toggleLike} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill={live.liked ? '#E8622A' : 'none'} stroke={live.liked ? '#E8622A' : '#fff'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            <span style={{ fontSize: 11, fontWeight: 700 }}>{live.likes}</span>
          </button>
          <button onClick={() => setCommentsOpen(true)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
            <span style={{ fontSize: 11, fontWeight: 700 }}>{live.comments}</span>
          </button>
          <button onClick={share} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          </button>
        </div>
      </div>

      {commentsOpen && (
        <MomentComments
          momentId={m.id}
          onClose={() => setCommentsOpen(false)}
          onAdded={() => setLikeState(s => ({ ...s, [m.id]: { ...(s[m.id] ?? { liked: m.liked, likes: m.likes, comments: m.comments }), comments: (s[m.id]?.comments ?? m.comments) + 1 } }))}
        />
      )}
    </div>,
    document.body,
  )
}

// ── Feuille commentaires ────────────────────────────────────────────────────
function MomentComments({ momentId, onClose, onAdded }: { momentId: string; onClose: () => void; onAdded: () => void }) {
  const { user } = useAuth()
  const [list, setList] = useState<MomentCommentaire[]>([])
  const [texte, setTexte] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch(`/api/moments/${momentId}/commentaires`).then(r => r.json()).then(d => setList(d.commentaires ?? [])).catch(() => {})
  }, [momentId])

  const submit = async () => {
    const t = texte.trim()
    if (!t || !user) { if (!user) toast('Connecte-toi pour commenter'); return }
    setBusy(true)
    const { data: { session } } = await supabase.auth.getSession()
    const r = await fetch(`/api/moments/${momentId}/commentaires`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify({ texte: t }) })
    setBusy(false)
    if (!r.ok) { toast.error('Échec'); return }
    const d = await r.json()
    setList(l => [...l, d.commentaire]); setTexte(''); onAdded()
  }

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 9, fontFamily: 'Inter, sans-serif' }}>
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
    </div>
  )
}
