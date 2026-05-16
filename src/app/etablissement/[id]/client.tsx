'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import { useAdminSession } from '@/hooks/useAdminSession'
import { ETAB_TYPES } from '@/lib/etablissement-types'
import EtabEditDrawer from '@/components/EtabEditDrawer'
import EtabProductsSection from '@/components/EtabProductsSection'
import type { Etablissement } from '@/lib/types'
import { can, toUserContext } from '@/lib/capabilities'
import { QuotaReachedModal } from '@/components/HubModals'
import PromotionsManager from '@/components/PromotionsManager'
import FeatureButton from '@/components/FeatureButton'
import SubscriptionModal from '@/components/SubscriptionModal'

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
const DAY_KEYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

interface Comment {
  id: string; user_id: string; content: string; parent_id: string | null; created_at: string
  profile: { user_id: string; display_name: string | null; avatar_url: string | null } | null
}

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return 'à l\'instant'; if (m < 60) return `${m} min`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`; return `${Math.floor(h / 24)}j`
}
function Avatar({ name, url, size = 32 }: { name: string; url?: string | null; size?: number }) {
  if (url) return <img src={url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return <div style={{ width: size, height: size, borderRadius: '50%', backgroundColor: '#2D5A3D', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.38, flexShrink: 0 }}>{(name || '?')[0].toUpperCase()}</div>
}

export default function EtablissementPageClient({ id, onBack }: { id: string; onBack?: () => void }) {
  const router = useRouter()
  const { user, profile } = useAuth()
  const { openAuthModal } = useAuthModal()
  const isAdmin = useAdminSession()
  const [etab, setEtab]             = useState<Etablissement | null>(null)
  const [etabPromos, setEtabPromos] = useState<Array<{ id: string; title: string; description: string | null; image_url: string | null; conditions: string | null; valid_until: string | null }>>([])
  const [loading, setLoading]       = useState(true)
  const [photoIdx, setPhotoIdx]     = useState(0)
  const [isFav, setIsFav]           = useState(false)
  const [isFollowing, setIsFollowing] = useState(false)
  const [comments, setComments]     = useState<Comment[]>([])
  const [commentText, setCommentText] = useState('')
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editCommentText, setEditCommentText] = useState('')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [claimOpen, setClaimOpen]   = useState(false)
  const [quotaModalOpen, setQuotaModalOpen] = useState(false)
  const [editing, setEditing]       = useState(false)
  const [toast, setToast]           = useState<string | null>(null)
  const [manageLoading, setManageLoading] = useState(false)
  const toastTimer       = useRef<ReturnType<typeof setTimeout>>()
  const commentsRef      = useRef<HTMLDivElement>(null)
  const photosScrollerRef = useRef<HTMLDivElement | null>(null)

  const showToast = useCallback((msg: string) => {
    clearTimeout(toastTimer.current); setToast(msg)
    toastTimer.current = setTimeout(() => setToast(null), 2000)
  }, [])

  const handleRelease = async () => {
    if (!confirm('Êtes-vous sûr de ne plus vouloir gérer cette fiche ? Vous perdrez l\'accès à son édition.')) return
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch(`/api/etablissements/${id}/release`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    })
    if (res.ok) {
      showToast('✓ Vous ne gérez plus cette fiche')
      setEtab(prev => prev ? { ...prev, user_id: null, plan: 'basic', is_featured: false } : prev)
    } else {
      const d = await res.json().catch(() => ({}))
      showToast(d.error ?? 'Erreur')
    }
  }

  const refreshEtab = async () => {
    const r = await fetch(`/api/etablissements/${id}`)
    const d = await r.json()
    if (d.etablissement) setEtab(d.etablissement)
  }

  // Routing 3-voies pour "Revendiquer cette fiche" :
  // - pas connecté → modal auth
  // - connecté + plan Pro/Max ou admin → claim direct (envoie commerce_request)
  // - connecté basic → modal d'abonnement Stripe
  const handleClaimClick = async () => {
    if (!user) {
      openAuthModal(`${window.location.origin}/etablissement/${id}`)
      return
    }
    const ctx = toUserContext(profile, isAdmin)
    if (!can(ctx, 'claim_etablissement')) {
      setClaimOpen(true)
      return
    }
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch(`/api/etablissements/${id}/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({}),
    })
    if (res.ok) {
      const data = await res.json().catch(() => ({}))
      if (data.autoApproved) {
        showToast('🎉 Vous gérez maintenant cette fiche !')
        await refreshEtab()
      } else {
        showToast('✓ Demande envoyée — un admin la validera bientôt')
      }
    } else {
      const d = await res.json().catch(() => ({}))
      if (d.quotaReached) {
        setQuotaModalOpen(true)
      } else {
        showToast(d.error ?? 'Erreur lors de la demande')
      }
    }
  }

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('subscribed') === '1') {
      showToast('🎉 Abonnement activé ! Vous gérez maintenant cette fiche.')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch(`/api/etablissements/${id}`).then(r => r.json())
      .then(d => { setEtab(d.etablissement); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id])

  // Promotions actives de cette fiche (visibles par tous les visiteurs)
  useEffect(() => {
    fetch(`/api/promotions?etab=${id}`)
      .then(r => r.json())
      .then(d => setEtabPromos(d.promotions ?? []))
      .catch(() => {})
  }, [id])

  useEffect(() => {
    fetch(`/api/etablissements/${id}/comments`)
      .then(r => r.json()).then(d => setComments(d.comments ?? []))
  }, [id])

  useEffect(() => {
    const ch = supabase.channel(`etab-comments-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'etablissement_comments', filter: `etablissement_id=eq.${id}` },
        async ({ new: c }) => {
          const row = c as { id: string; user_id: string; content: string; parent_id: string | null; created_at: string }
          const { data: prof } = await supabase.from('profiles').select('user_id, display_name, avatar_url').eq('user_id', row.user_id).maybeSingle()
          setComments(prev => prev.some(x => x.id === row.id) ? prev : [...prev, { ...row, profile: prof ?? null }])
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'etablissement_comments', filter: `etablissement_id=eq.${id}` },
        ({ old: c }) => setComments(prev => prev.filter(x => x.id !== (c as { id: string }).id)))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [id])

  useEffect(() => {
    if (!user) { setIsFav(false); setIsFollowing(false); return }
    supabase.auth.getSession().then(({ data: { session } }) => {
      const token = session?.access_token; if (!token) return
      Promise.all([
        fetch(`/api/etablissements/${id}/favorite`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
        fetch(`/api/etablissements/${id}/follow`,   { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      ]).then(([fav, fol]) => { setIsFav(!!fav.favorited); setIsFollowing(!!fol.following) })
    })
  }, [user?.id, id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleFav() {
    if (!user) { openAuthModal(); return }
    const next = !isFav; setIsFav(next); showToast(next ? '❤️ Ajouté aux favoris' : 'Retiré des favoris')
    const { data: { session } } = await supabase.auth.getSession(); const token = session?.access_token; if (!token) { setIsFav(!next); return }
    const res = await fetch(`/api/etablissements/${id}/favorite`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) setIsFav(!next)
  }
  async function toggleFollow() {
    if (!user) { openAuthModal(); return }
    const next = !isFollowing; setIsFollowing(next); showToast(next ? '✓ Vous suivez cet établissement' : 'Abonnement retiré')
    const { data: { session } } = await supabase.auth.getSession(); const token = session?.access_token; if (!token) { setIsFollowing(!next); return }
    const res = await fetch(`/api/etablissements/${id}/follow`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) setIsFollowing(!next)
  }
  function share() {
    const url = window.location.href
    if (navigator.share) navigator.share({ title: etab?.nom ?? '', url }).catch(() => {})
    else { navigator.clipboard.writeText(url).catch(() => {}); showToast('Lien copié !') }
  }
  function scrollToComments() {
    if (!commentsRef.current) return
    let parent: HTMLElement | null = commentsRef.current.parentElement
    while (parent) {
      const ov = window.getComputedStyle(parent).overflowY
      if (ov === 'auto' || ov === 'scroll') { parent.scrollTo({ top: commentsRef.current.getBoundingClientRect().top - parent.getBoundingClientRect().top + parent.scrollTop - 12, behavior: 'smooth' }); return }
      parent = parent.parentElement
    }
    commentsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  async function sendComment() {
    if (!user) { openAuthModal(); return }
    if (!commentText.trim()) return
    const text = commentText.trim(); setCommentText('')
    const tempId = `temp-${Date.now()}`
    setComments(prev => [...prev, { id: tempId, user_id: user.id, content: text, parent_id: null, created_at: new Date().toISOString(), profile: profile ? { user_id: user.id, display_name: profile.display_name, avatar_url: profile.avatar_url } : null }])
    const { data: { session } } = await supabase.auth.getSession(); const token = session?.access_token; if (!token) return
    const res = await fetch(`/api/etablissements/${id}/comments`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ content: text }) })
    if (res.ok) { const d = await res.json(); setComments(prev => prev.map(c => c.id === tempId ? d.comment : c)) }
    else setComments(prev => prev.filter(c => c.id !== tempId))
  }
  async function deleteComment(commentId: string) {
    const { data: { session } } = await supabase.auth.getSession(); const token = session?.access_token; if (!token) return
    const res = await fetch(`/api/etablissements/${id}/comments/${commentId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) setComments(prev => prev.filter(c => c.id !== commentId))
  }
  async function saveEditComment(commentId: string) {
    if (!editCommentText.trim()) return
    const { data: { session } } = await supabase.auth.getSession(); const token = session?.access_token; if (!token) return
    const res = await fetch(`/api/etablissements/${id}/comments/${commentId}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ content: editCommentText.trim() }) })
    if (res.ok) { const d = await res.json(); setComments(prev => prev.map(c => c.id === commentId ? { ...c, content: d.content } : c)); setEditingCommentId(null) }
  }

  async function openManage() {
    setManageLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return
      const res = await fetch('/api/stripe/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ etabId: id }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else showToast(data.error ?? 'Erreur portail')
    } catch { showToast('Erreur de connexion') }
    setManageLoading(false)
  }

  if (loading) return <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F0E8' }}><div style={{ width: 32, height: 32, borderRadius: '50%', border: '4px solid #E0D8CE', borderTopColor: '#2D5A3D', animation: 'spin 0.7s linear infinite' }} /></div>
  if (!etab) return <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F0E8' }}><p style={{ color: '#8A8A8A', fontFamily: 'Inter, sans-serif' }}>Établissement introuvable</p></div>

  const typeInfo = ETAB_TYPES[etab.type]
  const photos = etab.photos ?? []
  const isOwner = !!user && etab.user_id === user.id
  const canEdit = isAdmin || isOwner
  const horaires = etab.horaires ? DAY_KEYS.map((k, i) => ({ day: DAYS[i], val: (etab.horaires as Record<string, string>)[k] ?? null })) : []
  const mapsUrl = etab.lat && etab.lng ? `https://www.google.com/maps/dir/?api=1&destination=${etab.lat},${etab.lng}` : etab.adresse ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(etab.adresse)}` : null
  const commentCount = comments.length

  const BTN: React.CSSProperties = { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '12px 4px', border: 'none', backgroundColor: 'transparent', cursor: 'pointer', WebkitTapHighlightColor: 'transparent', minWidth: 0 }
  const LBL: React.CSSProperties = { fontSize: 10, fontWeight: 600, fontFamily: 'Inter, sans-serif', lineHeight: 1 }
  // V3 — card unifiée
  const CARD: React.CSSProperties = { backgroundColor: '#fff', borderRadius: 16, padding: '16px 18px', border: '1px solid #F0EAE0', boxShadow: '0 1px 4px rgba(44,28,16,0.04)' }

  return (
    <div style={{ minHeight: '100dvh', backgroundColor: '#FDFAF5', fontFamily: 'Inter, sans-serif' }}>
      {toast && <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 999, backgroundColor: '#1A1209', color: '#fff', borderRadius: 14, padding: '10px 20px', fontSize: 13, fontWeight: 600, pointerEvents: 'none', boxShadow: '0 6px 24px rgba(0,0,0,0.28)' }}>{toast}</div>}

      {/* Photo / Carousel swipable */}
      <div style={{ position: 'relative', height: 290, backgroundColor: typeInfo.bg, overflow: 'hidden' }}>
        {/* Floating top actions */}
        <div style={{ position: 'absolute', top: 48, left: 0, right: 0, padding: '0 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 6 }}>
          <button onClick={() => onBack ? onBack() : router.back()} aria-label="Retour" style={{
            width: 38, height: 38, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(8px)', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#1A1209', boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
            </svg>
          </button>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {isAdmin && <FeatureButton contentType="etablissement" contentId={etab.id} ownerUserId={etab.user_id ?? null} />}
            {canEdit && (
              <button onClick={() => setEditing(true)} aria-label="Éditer" style={{
                width: 38, height: 38, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.92)',
                backdropFilter: 'blur(8px)', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#1A1209', boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9"/>
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
                </svg>
              </button>
            )}
            <button onClick={share} aria-label="Partager" style={{
              width: 38, height: 38, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.92)',
              backdropFilter: 'blur(8px)', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#1A1209', boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                <polyline points="16 6 12 2 8 6"/>
                <line x1="12" y1="2" x2="12" y2="15"/>
              </svg>
            </button>
          </div>
        </div>
        {photos.length > 0 ? (
          <div
            ref={photosScrollerRef}
            onScroll={() => {
              const el = photosScrollerRef.current
              if (!el || el.clientWidth === 0) return
              const idx = Math.round(el.scrollLeft / el.clientWidth)
              if (idx !== photoIdx) setPhotoIdx(idx)
            }}
            style={{
              display: 'flex', width: '100%', height: '100%',
              overflowX: 'auto', overflowY: 'hidden',
              scrollSnapType: 'x mandatory',
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
              touchAction: 'pan-x',
            }}
            className="pdv-hscroll"
          >
            {photos.map((url, i) => (
              <img
                key={i}
                src={url}
                alt=""
                draggable={false}
                style={{
                  flex: '0 0 100%', width: '100%', height: '100%',
                  objectFit: 'cover', scrollSnapAlign: 'start',
                  userSelect: 'none',
                }}
              />
            ))}
          </div>
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 72 }}>{typeInfo.emoji}</div>
        )}
        <div style={{ position: 'absolute', inset: 'auto 0 0 0', height: 120, background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.35) 100%)', pointerEvents: 'none' }} />
        {/* Type chip + featured chip — bottom-left V3 */}
        <div style={{ position: 'absolute', bottom: 14, left: 14, display: 'flex', gap: 6, pointerEvents: 'none', zIndex: 3 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            backgroundColor: 'rgba(232,242,235,0.95)', backdropFilter: 'blur(4px)',
            color: '#2D5A3D', borderRadius: 999, padding: '5px 10px',
            fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>{typeInfo.label}</span>
          {(etab.is_featured || etab.plan === 'pro') && (
            <span style={{
              backgroundColor: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(4px)',
              color: '#8B6914', borderRadius: 999, padding: '5px 10px',
              fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>★ À la une</span>
          )}
        </div>
        {photos.length > 1 && (
          <div
            style={{
              position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
              display: 'flex', alignItems: 'center', gap: 5, zIndex: 3,
              background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(6px)',
              padding: '5px 10px', borderRadius: 999,
              pointerEvents: 'none',
            }}
          >
            {photos.map((_, i) => (
              i === photoIdx
                ? <span key={i} style={{ width: 14, height: 4, background: '#fff', borderRadius: 2 }} />
                : <span key={i} style={{ width: 4, height: 4, background: 'rgba(255,255,255,0.55)', borderRadius: '50%' }} />
            ))}
          </div>
        )}
      </div>

      {/* ContentCard sliding up */}
      <div style={{ position: 'relative', zIndex: 4, marginTop: -20, backgroundColor: '#fff', borderRadius: '24px 24px 0 0', paddingBottom: 24 }}>

        {/* Title + meta */}
        <div style={{ padding: '18px 16px 0' }}>
          <h1 style={{
            margin: 0, fontFamily: '"DM Serif Display", Georgia, serif',
            fontSize: 28, lineHeight: 1.1, color: '#1A1209',
            letterSpacing: '-0.02em', fontWeight: 400,
          }}>{etab.nom}</h1>
          {(etab.note_google || etab.commune) && (
            <div style={{ marginTop: 6, fontSize: 13, color: '#7A6A5A', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {etab.note_google != null && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#D4A93C' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9"/>
                  </svg>
                  <span style={{ color: '#1A1209', fontWeight: 700 }}>{etab.note_google.toFixed(1)}</span>
                  <span style={{ color: '#7A6A5A', fontWeight: 500 }}>Google</span>
                </span>
              )}
            </div>
          )}
          {etab.commune && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#7A6A5A', display: 'flex', alignItems: 'center', gap: 5 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s-7-7.5-7-12a7 7 0 0 1 14 0c0 4.5-7 12-7 12z"/>
                <circle cx="12" cy="10" r="2.5"/>
              </svg>
              {etab.adresse ?? etab.commune}
            </div>
          )}
        </div>

        {/* Action bar V3 */}
        <div style={{ padding: '18px 16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'stretch', backgroundColor: '#fff', border: '1px solid #F0EAE0', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(44,28,16,0.04)' }}>
            <button style={{ ...BTN, color: isFav ? '#C84B2F' : '#1A1209' }} onClick={toggleFav}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              <span style={{ ...LBL, color: isFav ? '#C84B2F' : '#7A6A5A' }}>Favori</span>
            </button>
            {etab.user_id !== user?.id && (
              <>
                <div style={{ width: 1, alignSelf: 'stretch', backgroundColor: '#F0EAE0', margin: '10px 0' }} />
                <button style={{ ...BTN, color: isFollowing ? '#2D5A3D' : '#1A1209' }} onClick={toggleFollow}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    {isFollowing ? <path d="M20 6L9 17l-5-5"/> : <><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/></>}
                  </svg>
                  <span style={{ ...LBL, color: isFollowing ? '#2D5A3D' : '#7A6A5A' }}>{isFollowing ? 'Suivi' : 'Suivre'}</span>
                </button>
              </>
            )}
            <div style={{ width: 1, alignSelf: 'stretch', backgroundColor: '#F0EAE0', margin: '10px 0' }} />
            <button style={BTN} onClick={scrollToComments}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <span style={{ ...LBL, color: '#7A6A5A' }}>Avis</span>
              {commentCount > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: '#1A1209', lineHeight: 1 }}>{commentCount}</span>}
            </button>
            <div style={{ width: 1, alignSelf: 'stretch', backgroundColor: '#F0EAE0', margin: '10px 0' }} />
            <button style={BTN} onClick={share}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                <polyline points="16 6 12 2 8 6"/>
                <line x1="12" y1="2" x2="12" y2="15"/>
              </svg>
              <span style={{ ...LBL, color: '#7A6A5A' }}>Partager</span>
            </button>
          </div>
        </div>

      <div style={{ padding: '18px 12px 96px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Description */}
        {(etab.description_courte || etab.description_longue) && (
          <div style={CARD}>
            <h3 style={{ fontSize: 11, fontWeight: 800, color: '#8A7A6A', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>À propos</h3>
            {etab.description_courte && <p style={{ fontSize: 14, color: '#4A3728', lineHeight: 1.7, margin: '0 0 6px' }}>{etab.description_courte}</p>}
            {etab.description_longue && <p style={{ fontSize: 13, color: '#6B5E4E', lineHeight: 1.7, margin: 0 }}>{etab.description_longue}</p>}
          </div>
        )}

        {/* Horaires */}
        {horaires.some(h => h.val) && (
          <div style={CARD}>
            <h3 style={{ fontSize: 11, fontWeight: 800, color: '#8A7A6A', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Horaires</h3>
            {horaires.map(({ day, val }) => val && (
              <div key={day} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#3C2C20', padding: '4px 0', borderBottom: '1px solid #F0EDE8' }}>
                <span style={{ fontWeight: 600 }}>{day}</span>
                <span style={{ color: '#6B5E4E' }}>{val}</span>
              </div>
            ))}
          </div>
        )}

        {/* Contacts */}
        {(etab.contact_tel || etab.contact_whatsapp || etab.site_web || mapsUrl) && (
          <div style={{ ...CARD, padding: '16px 18px' }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: '#8A7A6A', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Contact</p>
            {etab.contact_tel && <a href={`tel:${etab.contact_tel}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', textDecoration: 'none', borderBottom: '1px solid #F0E8DC' }}>
              <span style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#E8F2EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>📞</span>
              <span style={{ flex: 1, fontSize: 14, color: '#2D5A3D', fontWeight: 600 }}>{etab.contact_tel}</span>
              <span style={{ color: '#C8B8A8', fontSize: 20 }}>›</span>
            </a>}
            {etab.contact_whatsapp && <a href={`https://wa.me/${etab.contact_whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', textDecoration: 'none', borderBottom: '1px solid #F0E8DC' }}>
              <span style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#E8F2EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>💬</span>
              <span style={{ flex: 1, fontSize: 14, color: '#2D5A3D', fontWeight: 600 }}>WhatsApp</span>
              <span style={{ color: '#C8B8A8', fontSize: 20 }}>›</span>
            </a>}
            {etab.site_web && <a href={etab.site_web.startsWith('http') ? etab.site_web : `https://${etab.site_web}`} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', textDecoration: 'none', borderBottom: mapsUrl ? '1px solid #F0E8DC' : 'none' }}>
              <span style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#E8F2EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>🔗</span>
              <span style={{ flex: 1, fontSize: 14, color: '#2D5A3D', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{etab.site_web.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
              <span style={{ color: '#C8B8A8', fontSize: 20 }}>›</span>
            </a>}
            {mapsUrl && <a href={mapsUrl} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', textDecoration: 'none' }}>
              <span style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#E8F2EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>🗺️</span>
              <span style={{ flex: 1, fontSize: 14, color: '#2D5A3D', fontWeight: 600 }}>Voir l&apos;itinéraire</span>
              <span style={{ color: '#C8B8A8', fontSize: 20 }}>›</span>
            </a>}
          </div>
        )}

        {/* Claim */}
        {!isOwner && !etab.user_id && (
          <div style={{ padding: '14px 16px', borderRadius: 16, backgroundColor: '#F8F4EE', border: '1.5px dashed #D0C8C0' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#3C2C20', margin: '0 0 4px' }}>Vous gérez cet établissement ?</p>
            <p style={{ fontSize: 12, color: '#8A8A8A', lineHeight: 1.5, margin: '0 0 12px' }}>Revendiquez cette fiche pour la compléter et la gérer.</p>
            <button onClick={handleClaimClick}
              style={{ padding: '10px 20px', borderRadius: 999, backgroundColor: '#2D5A3D', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
              Revendiquer cette fiche
            </button>
          </div>
        )}
        {isOwner && (() => {
          // Le plan affiche est celui du USER (profile.plan) sinon fallback sur etab.plan
          // pour absorber un éventuel décalage de sync.
          const userPlan = (profile?.plan ?? 'basic') as 'basic' | 'habitants' | 'pro'
          const effectivePlan: 'basic' | 'habitants' | 'pro' =
            userPlan === 'pro' || etab.plan === 'pro' ? 'pro'
            : userPlan === 'habitants' ? 'habitants'
            : 'basic'
          const isPaid = effectivePlan !== 'basic'
          return (
            <div style={{ padding: '14px 16px', borderRadius: 16, backgroundColor: '#E8F2EB' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#2D5A3D', margin: '0 0 4px' }}>✓ Vous gérez cette fiche</p>
                  <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', borderRadius: 999, padding: '2px 8px',
                    backgroundColor: effectivePlan === 'pro' ? '#3A5BC7' : effectivePlan === 'habitants' ? '#4A8B5C' : '#D0C8C0',
                    color: effectivePlan === 'basic' ? '#666' : '#fff',
                  }}>{effectivePlan === 'pro' ? 'Partenaire' : effectivePlan === 'habitants' ? 'Habitants' : 'Basic'}</span>
                </div>
                {isPaid ? (
                  <button onClick={openManage} disabled={manageLoading} style={{ padding: '9px 14px', borderRadius: 10, border: '1.5px solid #2D5A3D', backgroundColor: 'transparent', color: '#2D5A3D', fontSize: 12, fontWeight: 700, cursor: manageLoading ? 'default' : 'pointer', opacity: manageLoading ? 0.6 : 1, fontFamily: 'Inter, sans-serif' }}>
                    {manageLoading ? '…' : 'Gérer l\'abonnement'}
                  </button>
                ) : (
                  <button onClick={() => setClaimOpen(true)} style={{ padding: '9px 14px', borderRadius: 10, border: 'none', backgroundColor: '#2D5A3D', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                    Passer à Pro / Max
                  </button>
                )}
              </div>
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #D0E0D5', textAlign: 'right' }}>
                <button onClick={handleRelease}
                  style={{ background: 'none', border: 'none', color: '#A0654E', fontSize: 11, cursor: 'pointer', textDecoration: 'underline', fontFamily: 'Inter, sans-serif', padding: 0 }}>
                  Ne plus gérer cette fiche
                </button>
              </div>
            </div>
          )
        })()}

        {/* Bons plans actuels — visibles par tous les visiteurs */}
        {etabPromos.length > 0 && (
          <div style={CARD}>
            <p style={{ fontSize: 11, fontWeight: 800, color: '#E8622A', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              🎁 Bons plans
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {etabPromos.map(p => (
                <Link
                  key={p.id}
                  href={`/promotions?id=${p.id}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 12px', borderRadius: 12,
                    backgroundColor: '#FFF1E8', border: '1px solid #F5C9A8',
                    textDecoration: 'none', color: 'inherit',
                  }}
                >
                  {p.image_url ? (
                    <img src={p.image_url} alt="" style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: '#E8622A', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>🎁</div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#1A1209', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</p>
                    {p.description && (
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: '#7A5614', lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{p.description}</p>
                    )}
                    {p.valid_until && (
                      <p style={{ margin: '4px 0 0', fontSize: 10, color: '#E8622A', fontWeight: 700 }}>
                        Jusqu&apos;au {new Date(p.valid_until).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                      </p>
                    )}
                  </div>
                  <span style={{ color: '#E8622A', fontSize: 18, flexShrink: 0 }}>›</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Mes promotions — visible uniquement pour le Partenaire Local propriétaire */}
        {isOwner && (() => {
          const userPlan = (profile?.plan ?? 'basic') as 'basic'|'habitants'|'pro'
          const canCreatePromo = userPlan === 'pro' || isAdmin
          if (!canCreatePromo) return null
          return (
            <div style={CARD}>
              <PromotionsManager etablissementId={etab.id} etablissementPhotos={etab.photos ?? []} />
            </div>
          )
        })()}

        {/* Commentaires */}
        <div ref={commentsRef} style={CARD}>
          <p style={{ fontSize: 11, fontWeight: 800, color: '#8A7A6A', margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Avis {commentCount > 0 && `(${commentCount})`}</p>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <Avatar name={profile?.display_name || user?.email || '?'} url={profile?.avatar_url} size={34} />
            <div style={{ flex: 1, display: 'flex', gap: 8 }}>
              <input value={commentText} onChange={e => setCommentText(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendComment()}
                placeholder={user ? 'Votre avis…' : 'Connectez-vous pour commenter'}
                style={{ flex: 1, padding: '9px 13px', borderRadius: 12, border: '1.5px solid #E8E0D5', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none', color: '#2C1810', backgroundColor: '#FAF7F2' }}
                onClick={() => { if (!user) openAuthModal() }} />
              <button onClick={sendComment} disabled={!commentText.trim()}
                style={{ padding: '9px 16px', borderRadius: 12, border: 'none', backgroundColor: commentText.trim() ? '#2D5A3D' : '#D8D0C8', color: '#fff', fontWeight: 700, fontSize: 13, cursor: commentText.trim() ? 'pointer' : 'default' }}>→</button>
            </div>
          </div>
          {comments.length === 0 && <p style={{ fontSize: 13, color: '#AAA', textAlign: 'center', margin: 0 }}>Soyez le premier à donner votre avis !</p>}
          {comments.map(c => (
            <div key={c.id} style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <Avatar name={c.profile?.display_name || '?'} url={c.profile?.avatar_url} size={32} />
              <div style={{ flex: 1, backgroundColor: '#FAF7F2', borderRadius: 12, padding: '9px 13px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <a href={`/profil/${c.user_id}`} style={{ fontSize: 13, fontWeight: 700, color: '#2C1810', textDecoration: 'none' }}>{c.profile?.display_name ?? 'Anonyme'}</a>
                  <span style={{ fontSize: 11, color: '#AAA' }}>{timeAgo(c.created_at)}</span>
                  {c.user_id === user?.id && editingCommentId !== c.id && (
                    <div style={{ marginLeft: 'auto', position: 'relative' }}>
                      <button onClick={() => setOpenMenuId(openMenuId === c.id ? null : c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8A7A6A', fontSize: 18 }}>⋮</button>
                      {openMenuId === c.id && (
                        <div style={{ position: 'absolute', right: 0, top: '110%', backgroundColor: '#fff', borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.13)', zIndex: 20, minWidth: 150, overflow: 'hidden' }}>
                          <button onClick={() => { setEditingCommentId(c.id); setEditCommentText(c.content); setOpenMenuId(null) }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#2C1810', fontFamily: 'Inter, sans-serif' }}>✏️ Modifier</button>
                          <div style={{ height: 1, backgroundColor: '#F0EDE8', margin: '0 14px' }} />
                          <button onClick={() => { deleteComment(c.id); setOpenMenuId(null) }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#E8622A', fontFamily: 'Inter, sans-serif' }}>🗑️ Supprimer</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {editingCommentId === c.id ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input value={editCommentText} onChange={e => setEditCommentText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEditComment(c.id); if (e.key === 'Escape') setEditingCommentId(null) }} autoFocus style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1.5px solid #2D5A3D', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none', backgroundColor: '#fff' }} />
                    <button onClick={() => saveEditComment(c.id)} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', backgroundColor: '#2D5A3D', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>✓</button>
                    <button onClick={() => setEditingCommentId(null)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #DDD', backgroundColor: 'transparent', fontSize: 12, cursor: 'pointer' }}>✕</button>
                  </div>
                ) : <p style={{ fontSize: 13, color: '#4A3728', margin: 0, lineHeight: 1.55 }}>{c.content}</p>}
              </div>
            </div>
          ))}
        </div>

        {/* Produits — Partenaire Local uniquement (anciennement Max) */}
        {isOwner && etab.plan === 'pro' && (
          <EtabProductsSection etabId={etab.id} />
        )}

      </div>
      </div>

      {/* Sticky bottom bar V3 — Appeler + Itinéraire */}
      {(etab.contact_tel || mapsUrl) && (
        <div style={{
          position: 'sticky', bottom: 0, left: 0, right: 0, zIndex: 30,
          backgroundColor: '#fff', borderTop: '1px solid #EDE8E0',
          padding: '12px 16px 16px', display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 -4px 16px rgba(44,28,16,0.04)',
        }}>
          {etab.contact_tel && (
            <a href={`tel:${etab.contact_tel}`} style={{
              flex: 1, height: 46, borderRadius: 13,
              backgroundColor: '#fff', border: '1px solid #E8E0D4',
              fontSize: 12, fontWeight: 700, color: '#1A1209',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              textDecoration: 'none',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              Appeler
            </a>
          )}
          {mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{
              flex: etab.contact_tel ? 1.5 : 1, height: 46, borderRadius: 13,
              backgroundColor: '#2D5A3D', color: '#fff', border: 'none',
              fontSize: 13, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              textDecoration: 'none',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="3 11 22 2 13 21 11 13 3 11"/>
              </svg>
              Itinéraire
            </a>
          )}
        </div>
      )}

      {claimOpen && (
        <SubscriptionModal
          context={{ kind: 'claim', etabId: etab.id, etabNom: etab.nom }}
          onClose={() => setClaimOpen(false)}
          currentPlan={(profile?.plan as 'basic' | 'habitants' | 'pro') ?? 'basic'}
        />
      )}
      {quotaModalOpen && (
        <QuotaReachedModal
          onClose={() => setQuotaModalOpen(false)}
          etablissementId={etab.id}
          etablissementNom={etab.nom}
        />
      )}
      {editing && <EtabEditDrawer etab={etab} isAdmin={isAdmin} onClose={() => setEditing(false)} onSaved={patch => setEtab(prev => prev ? { ...prev, ...patch } : prev)} />}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
