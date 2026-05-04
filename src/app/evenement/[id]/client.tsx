'use client'
import React from 'react'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Evenement, isApproxLocation } from '@/lib/types'
import { CATEGORIES } from '@/lib/categories'
import { formatDate } from '@/lib/filters'
import Link from 'next/link'
import ImageLightbox from '@/components/ImageLightbox'
import CommentSheet from '@/components/CommentSheet'
import EventEditDrawer from '@/components/EventEditDrawer'
import { useAdminSession } from '@/hooks/useAdminSession'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import { useFavorites } from '@/hooks/useFavorites'

const LINK_STYLE = { color: '#C4622D', textDecoration: 'underline', wordBreak: 'break-all' } as const

function linkify(text: string): React.ReactNode {
  const urlRe = /(https?:\/\/[^\s]+|www\.[^\s]+\.[^\s]+)/g
  const nodes: React.ReactNode[] = []
  let last = 0, m: RegExpExecArray | null
  while ((m = urlRe.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const raw = m[0]
    const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    nodes.push(<a key={m.index} href={href} target="_blank" rel="noopener noreferrer" style={LINK_STYLE}>{raw}</a>)
    last = m.index + raw.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes.length === 1 && typeof nodes[0] === 'string' ? nodes[0] : <>{nodes}</>
}

function renderContact(contact: string): React.ReactNode {
  const s = contact.trim()
  if (/^https?:\/\//i.test(s))
    return <a href={s} target="_blank" rel="noopener noreferrer" style={LINK_STYLE}>{s.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a>
  if (/^www\.[^\s]+$/.test(s))
    return <a href={`https://${s}`} target="_blank" rel="noopener noreferrer" style={LINK_STYLE}>{s}</a>
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
    return <a href={`mailto:${s}`} style={LINK_STYLE}>{s}</a>
  if (/^[\d\s+\-().]{6,}$/.test(s))
    return <a href={`tel:${s.replace(/[\s\-().]/g, '')}`} style={LINK_STYLE}>{s}</a>
  return <>{linkify(s)}</>
}

/* ── Barre d'actions Facebook-style ── */
const BTN: React.CSSProperties = {
  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  gap: 4, padding: '10px 4px', border: 'none', backgroundColor: 'transparent', cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent', touchAction: 'none',
}
const LBL: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, fontFamily: 'Inter, sans-serif',
}

function ActionBar({ evt, commentCount, onCommentOpen }: { evt: Evenement; commentCount: number; onCommentOpen: () => void }) {
  const { isFav, toggle: toggleFav } = useFavorites()
  const { user } = useAuth()
  const { openAuthModal } = useAuthModal()
  const [voted, setVoted]                   = useState(false)
  const [voteCount, setVoteCount]           = useState(evt.vote_count ?? 0)
  const [voteLoading, setVoteLoading]       = useState(false)
  const [interested, setInterested]         = useState(false)
  const [interestCount, setInterestCount]   = useState(0)
  const [interestLoading, setInterestLoading] = useState(false)
  const [toast, setToast]                   = useState<string | null>(null)
  const [voters, setVoters]                 = useState<{ id: string; name: string }[] | null>(null)
  const [loadingVoters, setLoadingVoters]   = useState(false)
  const lpTimer   = useRef<ReturnType<typeof setTimeout>>()
  const lpFired   = useRef(false)
  const fav       = isFav(evt.id)

  useEffect(() => {
    if (!user) return
    supabase.from('votes').select('id').eq('evenement_id', evt.id).eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setVoted(!!data))
  }, [user, evt.id])

  useEffect(() => {
    supabase.from('interests').select('id', { count: 'exact' }).eq('evenement_id', evt.id)
      .then(({ count }) => setInterestCount(count ?? 0))
    if (!user) return
    supabase.from('interests').select('id').eq('evenement_id', evt.id).eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setInterested(!!data))
  }, [user, evt.id])

  const showToast = (msg: string) => {
    setToast(null)
    requestAnimationFrame(() => setToast(msg))
    setTimeout(() => setToast(null), 1800)
  }

  const handleFav = () => {
    toggleFav(evt.id)
    showToast(!fav ? '❤️ Ajouté aux favoris' : 'Retiré des favoris')
  }

  const handleInterest = async () => {
    if (!user) { openAuthModal(); return }
    if (interestLoading) return
    setInterestLoading(true)
    if (interested) {
      await supabase.from('interests').delete().eq('evenement_id', evt.id).eq('user_id', user.id)
      setInterested(false)
      setInterestCount(p => Math.max(0, p - 1))
      showToast('Retiré')
    } else {
      await supabase.from('interests').insert({ evenement_id: evt.id, user_id: user.id })
      setInterested(true)
      setInterestCount(p => p + 1)
      showToast('⭐ Marqué comme intéressé')
    }
    setInterestLoading(false)
  }

  const handleShare = async () => {
    const url = `${window.location.origin}/evenement/${evt.id}`
    const cat = CATEGORIES[evt.categorie] ?? CATEGORIES.autre
    if (navigator.share) {
      try { await navigator.share({ title: evt.titre, text: `${cat.emoji} ${evt.titre}`, url }) } catch {}
    } else {
      await navigator.clipboard.writeText(url).catch(() => {})
      showToast('Lien copié !')
    }
  }

  const handleVote = async () => {
    if (lpFired.current) return
    if (!user) { openAuthModal(); return }
    if (voteLoading) return
    setVoteLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/votes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ evenement_id: evt.id }),
    })
    const d = await res.json()
    if (res.ok) { setVoted(d.voted); setVoteCount(d.vote_count) }
    setVoteLoading(false)
  }

  const fetchVoters = async () => {
    setVoters([])
    setLoadingVoters(true)
    const { data: voteData } = await supabase.from('votes').select('user_id').eq('evenement_id', evt.id)
    const ids = (voteData ?? []).map((v: { user_id: string }) => v.user_id)
    if (ids.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('user_id, display_name, email').in('user_id', ids)
      setVoters(((profiles ?? []) as { user_id: string; display_name: string | null; email: string | null }[])
        .map(p => ({ id: p.user_id, name: p.display_name || p.email?.split('@')[0] || 'Quelqu\'un' })))
    }
    setLoadingVoters(false)
  }

  const lpStart = (cb: () => void) => (e: React.PointerEvent) => {
    e.preventDefault(); lpFired.current = false
    lpTimer.current = setTimeout(() => { lpFired.current = true; cb() }, 550)
  }
  const lpEnd = () => {
    clearTimeout(lpTimer.current)
    setTimeout(() => { lpFired.current = false }, 60)
  }

  return (
    <div style={{ position: 'relative', backgroundColor: '#fff' }}>
      <style>{`
        @keyframes toastPop {
          0%  { opacity:0; transform:translateX(-50%) translateY(6px) scale(.94) }
          18% { opacity:1; transform:translateX(-50%) translateY(0)   scale(1)   }
          75% { opacity:1; transform:translateX(-50%) translateY(0)   scale(1)   }
          100%{ opacity:0; transform:translateX(-50%) translateY(-4px) scale(.96) }
        }
      `}</style>

      {/* Toast */}
      {toast && (
        <div key={toast + Date.now()} style={{
          position: 'absolute', top: -34, left: '50%',
          backgroundColor: 'rgba(18,18,18,0.82)', color: '#fff',
          fontSize: 12, fontWeight: 600, padding: '6px 16px', borderRadius: 999,
          whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 10,
          fontFamily: 'Inter, sans-serif', letterSpacing: '0.01em',
          animation: 'toastPop 1.8s ease forwards',
        }}>{toast}</div>
      )}

      {/* Icônes */}
      <div style={{
        display: 'flex',
        borderTop: '1px solid #EDE8E0', borderBottom: '1px solid #EDE8E0',
      }}>
        {/* Favori */}
        <button onClick={handleFav} style={BTN}>
          <svg width="21" height="21" viewBox="0 0 24 24" fill={fav ? '#EC407A' : 'none'} stroke={fav ? '#EC407A' : '#9CA3AF'} strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          <span style={{ ...LBL, color: fav ? '#EC407A' : '#9CA3AF' }}>Favori</span>
        </button>

        {/* Partager */}
        <button onClick={handleShare} style={BTN}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
          <span style={{ ...LBL, color: '#9CA3AF' }}>Partager</span>
        </button>

        {/* Intéressé */}
        <button onClick={handleInterest} disabled={interestLoading} style={BTN}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill={interested ? '#F59E0B' : 'none'} stroke={interested ? '#F59E0B' : '#9CA3AF'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            {interestCount > 0 && (
              <span style={{ fontSize: 13, fontWeight: 700, color: interested ? '#F59E0B' : '#9CA3AF', lineHeight: 1 }}>{interestCount}</span>
            )}
          </div>
          <span style={{ ...LBL, color: interested ? '#F59E0B' : '#9CA3AF' }}>Intéressé</span>
        </button>

        {/* Commenter */}
        <button onClick={onCommentOpen} style={BTN}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            {commentCount > 0 && (
              <span style={{ fontSize: 13, fontWeight: 700, color: '#9CA3AF', lineHeight: 1 }}>{commentCount}</span>
            )}
          </div>
          <span style={{ ...LBL, color: '#9CA3AF' }}>Commenter</span>
        </button>

        {/* Utile — long press → voters */}
        <button
          onClick={handleVote}
          onPointerDown={lpStart(fetchVoters)}
          onPointerUp={lpEnd}
          onPointerCancel={lpEnd}
          disabled={voteLoading}
          style={BTN}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill={voted ? 'var(--primary)' : 'none'} stroke={voted ? 'var(--primary)' : '#9CA3AF'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/>
              <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
            </svg>
            {voteCount > 0 && (
              <span style={{ fontSize: 13, fontWeight: 700, color: voted ? 'var(--primary)' : '#9CA3AF', lineHeight: 1 }}>
                {voteCount}
              </span>
            )}
          </div>
          <span style={{ ...LBL, color: voted ? 'var(--primary)' : '#9CA3AF' }}>Utile</span>
        </button>
      </div>

      {/* Popup voters (long press 👍) */}
      {voters !== null && (
        <>
          <div onClick={() => setVoters(null)} style={{ position: 'fixed', inset: 0, zIndex: 200, backgroundColor: 'rgba(0,0,0,0.35)' }} />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201,
            backgroundColor: '#fff', borderRadius: '20px 20px 0 0',
            padding: '16px 20px 44px', fontFamily: 'Inter, sans-serif',
          }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1CCC4', margin: '0 auto 16px' }} />
            <p style={{ fontWeight: 700, fontSize: 15, color: '#2C1810', marginBottom: 14 }}>
              👍 {voteCount} personne{voteCount !== 1 ? 's' : ''} trouve ça utile
            </p>
            {loadingVoters ? (
              <div style={{ textAlign: 'center', padding: '10px 0' }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', border: '3px solid #E0D8CE', borderTopColor: 'var(--primary)', animation: 'spin 0.7s linear infinite', margin: '0 auto' }} />
              </div>
            ) : voters.length === 0 ? (
              <p style={{ fontSize: 13, color: '#9A8E82' }}>Personne pour l&apos;instant.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {voters.map((p, i) => (
                  <Link key={i} href={`/profil/${p.id}`} onClick={() => setVoters(null)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                      backgroundColor: 'var(--primary-light)', color: 'var(--primary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800, fontSize: 14, fontFamily: 'Inter, sans-serif',
                    }}>{p.name[0].toUpperCase()}</div>
                    <span style={{ fontSize: 14, color: '#2C1810', fontWeight: 500 }}>{p.name}</span>
                  </Link>
                ))}
              </div>
            )}
            <button onClick={() => setVoters(null)} style={{
              width: '100%', marginTop: 18, padding: '12px', borderRadius: 14, border: 'none',
              backgroundColor: '#F5F1EC', color: '#6B7280', fontWeight: 600, fontSize: 14,
              cursor: 'pointer', fontFamily: 'Inter, sans-serif',
            }}>Fermer</button>
          </div>
        </>
      )}
    </div>
  )
}

/* ── Page principale ── */
export default function EvenementPageClient({ id }: { id: string }) {
  const [evt, setEvt]           = useState<Evenement | null>(null)
  const [loading, setLoading]   = useState(true)
  const [editing, setEditing]       = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentCount, setCommentCount] = useState(0)
  const isAdmin = useAdminSession()

  useEffect(() => {
    supabase.from('evenements').select('*, lieux(*)').eq('id', id).single()
      .then(({ data }) => {
        if (data) setEvt(data as Evenement)
        setLoading(false)
      })
    supabase.from('comments').select('id', { count: 'exact', head: true }).eq('evenement_id', id)
      .then(({ count }) => setCommentCount(count ?? 0))
  }, [id])

  if (loading) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FBF7F0' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '4px solid #E0D8CE', borderTopColor: '#C4622D', animation: 'spin 0.7s linear infinite' }} />
    </div>
  )

  if (!evt) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FBF7F0' }}>
      <p style={{ color: '#8A8A8A' }}>Événement introuvable</p>
    </div>
  )

  const cat    = CATEGORIES[evt.categorie] ?? CATEGORIES.autre
  const lieu   = evt.lieux
  const mapsUrl = lieu?.lat && lieu?.lng
    ? `https://www.google.com/maps/dir/?api=1&destination=${lieu.lat},${lieu.lng}`
    : lieu?.adresse
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(lieu.adresse)}`
    : null

  return (
    <div className="min-h-screen bg-[#FBF7F0]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-[#E8E0D5] px-4 py-3 flex items-center gap-3">
        <Link href="/" className="text-[#C4622D] font-bold text-2xl leading-none">←</Link>
        <h1 className="font-bold text-[#2C1810] flex-1 truncate text-base">{evt.titre}</h1>
        {isAdmin && (
          <button onClick={() => setEditing(true)}
            style={{ fontSize: 11, fontWeight: 700, color: '#C4622D', border: '1px solid #C4622D', borderRadius: 999, padding: '4px 12px', backgroundColor: 'transparent', cursor: 'pointer' }}>
            ✏️ Éditer
          </button>
        )}
      </div>

      {/* Photo */}
      {evt.image_url && <ImageLightbox src={evt.image_url} alt={evt.titre} objectPosition={evt.image_position ?? '50% 50%'} />}

      {/* Barre d'actions */}
      <ActionBar evt={evt} commentCount={commentCount} onCommentOpen={() => setCommentsOpen(true)} />

      {/* Contenu */}
      <div className="p-4 space-y-3 pb-8">
        <div>
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full text-white mb-2"
            style={{ backgroundColor: cat.color }}>
            {cat.emoji} {cat.label}
          </span>
          <h2 className="text-2xl font-bold text-[#2C1810] leading-tight">{evt.titre}</h2>
          {evt.submitted_by_name && (
            <p className="text-xs text-gray-400 mt-1">Proposé par {evt.submitted_by_name}</p>
          )}
        </div>

        <div className="bg-white rounded-2xl p-4 space-y-2.5">
          {evt.date_debut && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-base">📅</span>
              <span className="font-medium">{formatDate(evt.date_debut, 'long')}</span>
            </div>
          )}
          {evt.date_fin && evt.date_fin !== evt.date_debut && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-base">📅</span>
              <span className="text-gray-500">jusqu&apos;au {formatDate(evt.date_fin, 'long')}</span>
            </div>
          )}
          {evt.heure && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-base">🕐</span>
              <span className="font-medium">{evt.heure.slice(0, 5)}</span>
            </div>
          )}
          {lieu && (
            <div className="flex items-start gap-2 text-sm">
              <span className="text-base mt-0.5">📍</span>
              <div>
                <span className="font-medium">{lieu.nom}</span>
                {isApproxLocation(lieu) && (
                  <span className="ml-2 text-xs bg-orange-100 text-orange-500 font-semibold px-1.5 py-0.5 rounded-full">
                    localisation approximative
                  </span>
                )}
                {lieu.adresse && <p className="text-gray-500 text-xs">{lieu.adresse}</p>}
                {lieu.commune && !lieu.adresse && <p className="text-gray-500 text-xs">{lieu.commune}</p>}
              </div>
            </div>
          )}
          {evt.prix && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-base">💶</span>
              <span className="font-medium">{evt.prix}</span>
            </div>
          )}
        </div>

        {evt.description && (
          <div className="bg-white rounded-2xl p-4">
            <h3 className="font-bold text-[#2C1810] mb-2">À propos</h3>
            <p className="text-sm text-gray-600 leading-relaxed" style={{ whiteSpace: 'pre-wrap' }}>{linkify(evt.description)}</p>
          </div>
        )}

        {(evt.contact || evt.organisateurs) && (
          <div className="bg-white rounded-2xl p-4 space-y-1.5">
            <h3 className="font-bold text-[#2C1810] mb-1">Contact</h3>
            {evt.organisateurs && <p className="text-sm text-gray-600">🏛️ {renderContact(evt.organisateurs)}</p>}
            {evt.contact && <p className="text-sm text-gray-600">📞 {renderContact(evt.contact)}</p>}
          </div>
        )}

        {evt.source && /^https?:\/\//i.test(evt.source) && (
          <div className="bg-white rounded-2xl p-4">
            <a href={evt.source} target="_blank" rel="noopener noreferrer"
              className="text-sm font-medium"
              style={{ color: '#C4622D', textDecoration: 'underline', wordBreak: 'break-all' }}>
              🔗 Voir la source
            </a>
          </div>
        )}

        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
            className="block w-full bg-[#C4622D] text-white text-center py-4 rounded-2xl font-bold text-base shadow-md active:bg-[#A8521E] transition-colors">
            🗺️ Y aller
          </a>
        )}
      </div>

      {/* Commentaires */}
      <CommentSheet
        evenementId={evt.id}
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        onCountChange={setCommentCount}
      />

      {editing && (
        <EventEditDrawer
          evenementId={evt.id}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            supabase.from('evenements').select('*, lieux(*)').eq('id', id).single()
              .then(({ data }) => { if (data) setEvt(data as Evenement) })
          }}
        />
      )}
    </div>
  )
}
