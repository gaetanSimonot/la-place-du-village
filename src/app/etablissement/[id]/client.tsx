'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
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

const PRO_FEATURES = [
  'Édition complète de votre fiche',
  'Mise à la une (bandeau tournant)',
  'Visibilité augmentée sur la carte',
  'Followers — envoyez des notifications',
  'Accès à l\'application gestionnaire',
]
const MAX_FEATURES = [
  'Tout le plan Pro',
  'Splash screen régulier',
  'Bandeau publicitaire en app',
  'Intégration newsletter & actualités',
  'News / actu dynamique sur votre fiche',
  'Création fiche producteur',
  'Accès marketplace',
]

function SubscriptionModal({ etabId, etabNom, onClose }: { etabId: string; etabNom: string; onClose: () => void }) {
  const [loading, setLoading] = useState<'pro' | 'max' | null>(null)
  const [error, setError]     = useState<string | null>(null)

  async function selectPlan(plan: 'pro' | 'max') {
    setLoading(plan); setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) { setError('Connectez-vous pour continuer.'); setLoading(null); return }
      const res  = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ etabId, plan }),
      })
      const data = await res.json()
      if (data.url) { window.location.href = data.url; return }
      setError(data.error ?? 'Une erreur est survenue, veuillez réessayer.')
    } catch {
      setError('Impossible de contacter le serveur.')
    }
    setLoading(null)
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 400, backgroundColor: 'rgba(0,0,0,0.52)' }} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 401, backgroundColor: '#FDFAF6', borderRadius: '24px 24px 0 0', padding: '0 0 48px', fontFamily: 'Inter, sans-serif', maxHeight: '92dvh', overflowY: 'auto' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1CCC4', margin: '16px auto 0' }} />

        <div style={{ padding: '20px 20px 4px' }}>
          <p style={{ fontWeight: 900, fontSize: 19, color: '#1C1917', margin: '0 0 4px', lineHeight: 1.2 }}>Gérez &laquo;{etabNom}&raquo;</p>
          <p style={{ fontSize: 13, color: '#8A7A6A', margin: 0, lineHeight: 1.5 }}>Choisissez votre plan pour revendiquer cette fiche et débloquer vos outils.</p>
        </div>

        <div style={{ display: 'flex', gap: 12, padding: '16px 20px 0' }}>

          {/* Plan Pro */}
          <div style={{ flex: 1, borderRadius: 20, border: '2px solid #2D5A3D', backgroundColor: '#fff', padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 10, boxShadow: '0 4px 20px rgba(45,90,61,0.10)' }}>
            <div>
              <span style={{ fontSize: 10, fontWeight: 800, color: '#2D5A3D', backgroundColor: '#E8F2EB', borderRadius: 999, padding: '3px 10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Pro</span>
            </div>
            <div>
              <span style={{ fontSize: 28, fontWeight: 900, color: '#1C1917', fontVariantNumeric: 'tabular-nums' }}>9€</span>
              <span style={{ fontSize: 12, color: '#8A7A6A', marginLeft: 3 }}>/mois</span>
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
              {PRO_FEATURES.map(f => (
                <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 12, color: '#3C2C20', lineHeight: 1.4 }}>
                  <span style={{ color: '#2D5A3D', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>✓</span>{f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => selectPlan('pro')}
              disabled={!!loading}
              style={{ marginTop: 8, padding: '12px 0', borderRadius: 14, border: 'none', backgroundColor: loading === 'pro' ? '#A0B8A8' : '#2D5A3D', color: '#fff', fontWeight: 700, fontSize: 14, cursor: loading ? 'default' : 'pointer', fontFamily: 'Inter, sans-serif', transition: 'background 0.2s' }}
            >{loading === 'pro' ? '…' : 'Choisir Pro →'}</button>
          </div>

          {/* Plan Max */}
          <div style={{ flex: 1, borderRadius: 20, border: '2px solid #EC407A', backgroundColor: '#fff', padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 10, boxShadow: '0 4px 20px rgba(236,64,122,0.10)', position: 'relative' }}>
            <div style={{ position: 'absolute', top: -11, right: 14, backgroundColor: '#EC407A', color: '#fff', fontSize: 9, fontWeight: 800, borderRadius: 999, padding: '3px 10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>✦ Recommandé</div>
            <div>
              <span style={{ fontSize: 10, fontWeight: 800, color: '#EC407A', backgroundColor: '#FDE8EF', borderRadius: 999, padding: '3px 10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Max</span>
            </div>
            <div>
              <span style={{ fontSize: 28, fontWeight: 900, color: '#1C1917', fontVariantNumeric: 'tabular-nums' }}>29€</span>
              <span style={{ fontSize: 12, color: '#8A7A6A', marginLeft: 3 }}>/mois</span>
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
              {MAX_FEATURES.map(f => (
                <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 12, color: '#3C2C20', lineHeight: 1.4 }}>
                  <span style={{ color: '#EC407A', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>✓</span>{f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => selectPlan('max')}
              disabled={!!loading}
              style={{ marginTop: 8, padding: '12px 0', borderRadius: 14, border: 'none', backgroundColor: loading === 'max' ? '#E8A0C0' : '#EC407A', color: '#fff', fontWeight: 700, fontSize: 14, cursor: loading ? 'default' : 'pointer', fontFamily: 'Inter, sans-serif', transition: 'background 0.2s' }}
            >{loading === 'max' ? '…' : 'Choisir Max →'}</button>
          </div>

        </div>

        {error && (
          <p style={{ fontSize: 12, color: '#DC2626', textAlign: 'center', margin: '12px 20px 0', padding: '10px 14px', backgroundColor: '#FEF2F2', borderRadius: 12, lineHeight: 1.5 }}>{error}</p>
        )}
        <p style={{ fontSize: 11, color: '#AAA', textAlign: 'center', margin: '14px 20px 0', lineHeight: 1.5 }}>Paiement sécurisé par Stripe · Résiliable à tout moment</p>
      </div>
    </>
  )
}

export default function EtablissementPageClient({ id, onBack }: { id: string; onBack?: () => void }) {
  const router = useRouter()
  const { user, profile } = useAuth()
  const { openAuthModal } = useAuthModal()
  const isAdmin = useAdminSession()
  const [etab, setEtab]             = useState<Etablissement | null>(null)
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
  const toastTimer  = useRef<ReturnType<typeof setTimeout>>()
  const commentsRef = useRef<HTMLDivElement>(null)

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

  const BTN: React.CSSProperties = { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '13px 4px', border: 'none', backgroundColor: 'transparent', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }
  const LBL: React.CSSProperties = { fontSize: 11, fontWeight: 600, fontFamily: 'Inter, sans-serif' }
  const CARD: React.CSSProperties = { backgroundColor: '#fff', borderRadius: 16, padding: '16px 18px', boxShadow: '0 1px 8px rgba(44,28,16,0.08)' }

  return (
    <div style={{ minHeight: '100dvh', backgroundColor: '#F2EBE0', fontFamily: 'Inter, sans-serif' }}>
      {toast && <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 999, backgroundColor: '#2C1810', color: '#fff', borderRadius: 14, padding: '10px 20px', fontSize: 13, fontWeight: 600, pointerEvents: 'none', boxShadow: '0 6px 24px rgba(0,0,0,0.28)' }}>{toast}</div>}

      {/* Header sticky */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: 'rgba(242,235,224,0.92)', backdropFilter: 'blur(10px)', padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => onBack ? onBack() : router.back()} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.8)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2D5A3D', fontSize: 18, flexShrink: 0, boxShadow: '0 1px 6px rgba(0,0,0,0.1)' }}>←</button>
        <p style={{ flex: 1, fontWeight: 700, fontSize: 15, color: '#2C1810', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{etab.nom}</p>
        {canEdit && <button onClick={() => setEditing(true)} style={{ fontSize: 11, fontWeight: 700, color: '#2D5A3D', border: '1.5px solid #2D5A3D', borderRadius: 10, padding: '5px 12px', backgroundColor: 'transparent', cursor: 'pointer', flexShrink: 0 }}>✏️</button>}
      </div>

      {/* Photo */}
      <div style={{ position: 'relative', height: 280, backgroundColor: typeInfo.bg, overflow: 'hidden' }}>
        {photos.length > 0
          ? <img src={photos[photoIdx]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 72 }}>{typeInfo.emoji}</div>}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 18%, rgba(0,0,0,0.15) 48%, rgba(0,0,0,0.78) 100%)' }} />
        <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 6 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, backgroundColor: typeInfo.color, color: '#fff', borderRadius: 999, padding: '4px 11px', fontSize: 11, fontWeight: 800, letterSpacing: '0.04em' }}>{typeInfo.emoji} {typeInfo.label.toUpperCase()}</span>
          {(etab.is_featured || etab.plan === 'pro' || etab.plan === 'max') && <span style={{ backgroundColor: '#F5EFD6', color: '#8B6914', borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 700 }}>★ À la une</span>}
        </div>
        {photos.length > 1 && <>
          <button onClick={() => setPhotoIdx(i => (i - 1 + photos.length) % photos.length)} style={{ position: 'absolute', left: 10, top: '45%', transform: 'translateY(-50%)', width: 30, height: 30, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.55)', border: 'none', color: '#2C1810', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
          <button onClick={() => setPhotoIdx(i => (i + 1) % photos.length)} style={{ position: 'absolute', right: 10, top: '45%', transform: 'translateY(-50%)', width: 30, height: 30, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.55)', border: 'none', color: '#2C1810', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
        </>}
        <div style={{ position: 'absolute', bottom: 50, left: 16, right: 16 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#fff', margin: '0 0 3px', lineHeight: 1.15 }}>{etab.nom}</h1>
          {etab.commune && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', margin: '0 0 4px' }}>📍 {etab.commune}</p>}
          {etab.note_google && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', margin: 0 }}>⭐ {etab.note_google.toFixed(1)} Google</p>}
        </div>
      </div>

      {/* Bandeau action flottant */}
      <div style={{ position: 'relative', zIndex: 2, marginTop: -38, marginLeft: 12, marginRight: 12, borderRadius: 20, backgroundColor: '#fff', boxShadow: '0 2px 14px rgba(44,28,16,0.1)' }}>
        <div style={{ display: 'flex' }}>
          <button style={BTN} onClick={toggleFav}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill={isFav ? '#E8622A' : 'none'} stroke={isFav ? '#E8622A' : '#8A7A6A'} strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            <span style={{ ...LBL, color: isFav ? '#E8622A' : '#8A7A6A' }}>Favori</span>
          </button>
          {etab.user_id !== user?.id && (
            <button style={BTN} onClick={toggleFollow}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={isFollowing ? '#2D5A3D' : '#8A7A6A'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {isFollowing ? <path d="M20 6L9 17l-5-5"/> : <><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/></>}
              </svg>
              <span style={{ ...LBL, color: isFollowing ? '#2D5A3D' : '#8A7A6A' }}>{isFollowing ? 'Suivi ✓' : 'Suivre'}</span>
            </button>
          )}
          <button style={BTN} onClick={scrollToComments}>
            <div style={{ position: 'relative' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8A7A6A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              {commentCount > 0 && <span style={{ position: 'absolute', top: -5, right: -7, backgroundColor: '#2D5A3D', color: '#fff', borderRadius: 999, fontSize: 9, fontWeight: 700, padding: '0 4px', minWidth: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{commentCount}</span>}
            </div>
            <span style={{ ...LBL, color: '#8A7A6A' }}>Avis</span>
          </button>
          <button style={BTN} onClick={share}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8A7A6A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            <span style={{ ...LBL, color: '#8A7A6A' }}>Partager</span>
          </button>
        </div>
      </div>

      <div style={{ padding: '12px 12px 48px', display: 'flex', flexDirection: 'column', gap: 10 }}>

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
          // Le plan affiche celui du USER (profile.plan), pas celui de l'etablissement.
          // Phase D rebranchera le webhook Stripe sur profiles.plan, on n'aura plus besoin
          // de fallback. En attendant, on lit le plus haut des deux pour eviter d'afficher
          // "basic" a un user dont l'admin a force le plan a max.
          const userPlan = (profile?.plan ?? 'basic') as 'basic'|'pro'|'max'
          const effectivePlan: 'basic'|'pro'|'max' =
            userPlan === 'max' ? 'max'
            : userPlan === 'pro' || etab.plan === 'pro' || etab.plan === 'max' ? 'pro'
            : 'basic'
          const isPaid = effectivePlan !== 'basic'
          return (
            <div style={{ padding: '14px 16px', borderRadius: 16, backgroundColor: '#E8F2EB' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#2D5A3D', margin: '0 0 4px' }}>✓ Vous gérez cette fiche</p>
                  <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', borderRadius: 999, padding: '2px 8px',
                    backgroundColor: effectivePlan === 'max' ? '#EC407A' : effectivePlan === 'pro' ? '#2D5A3D' : '#D0C8C0',
                    color: effectivePlan === 'basic' ? '#666' : '#fff',
                  }}>{effectivePlan}</span>
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

        {/* Produits — plan Max uniquement */}
        {isOwner && etab.plan === 'max' && (
          <EtabProductsSection etabId={etab.id} />
        )}

      </div>

      {claimOpen && <SubscriptionModal etabId={etab.id} etabNom={etab.nom} onClose={() => setClaimOpen(false)} />}
      {quotaModalOpen && <QuotaReachedModal onClose={() => setQuotaModalOpen(false)} />}
      {editing && <EtabEditDrawer etab={etab} isAdmin={isAdmin} onClose={() => setEditing(false)} onSaved={patch => setEtab(prev => prev ? { ...prev, ...patch } : prev)} />}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
