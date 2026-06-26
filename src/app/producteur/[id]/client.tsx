'use client'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import { useAdminSession } from '@/hooks/useAdminSession'
import { PRODUIT_CATS_MAP, normalizeProduitCat } from '@/lib/produit-cats'
import ProducerEditDrawer from '@/components/ProducerEditDrawer'
import ProductsEditSection from '@/components/ProductsEditSection'
import FeatureButton from '@/components/FeatureButton'
import SubscriptionModal from '@/components/SubscriptionModal'
import BottomNavBar from '@/components/BottomNavBar'
import { can, toUserContext } from '@/lib/capabilities'
import { useSmartBack } from '@/hooks/useSmartBack'

interface Producer {
  id: string; nom: string; description_courte: string | null; description_longue: string | null
  commune: string | null; adresse: string | null; lat: number | null; lng: number | null
  contact_tel: string | null; contact_whatsapp: string | null; site_web: string | null
  photos: string[]; is_max: boolean; is_featured: boolean; user_id?: string | null
  vente_directe?: boolean | null; retrait_sur_place?: boolean | null
}
interface Product { id: string; nom: string; categorie: string; prix_indicatif: string | null; periode_dispo: string | null; disponible: boolean; image_url: string | null }
interface Comment {
  id: string; user_id: string; content: string; parent_id: string | null; created_at: string
  profile: { user_id: string; display_name: string | null; avatar_url: string | null } | null
}

const T = {
  primary: '#2D5A3D',
  primaryLight: '#E8F2EB',
  accent: '#C84B2F',
  texte: '#1A1209',
  texteDoux: '#7A6A5A',
  texteTresDoux: '#A99B89',
  creme: '#FDFAF5',
  cremeDeep: '#F7F1E6',
  bord: '#E8E0D4',
  bordSoft: '#F0EAE0',
  white: '#FFFFFF',
}

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return 'à l\'instant'; if (m < 60) return `${m} min`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`; return `${Math.floor(h / 24)}j`
}
function Avatar({ name, url, size = 32 }: { name: string; url?: string | null; size?: number }) {
  if (url) return <img src={url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return <div style={{ width: size, height: size, borderRadius: '50%', backgroundColor: T.primary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.38, flexShrink: 0 }}>{(name || '?')[0].toUpperCase()}</div>
}

// Floating circular button (back/share/heart)
function FloatBtn({ children, onClick, ariaLabel, color = T.texte, filled = false }: { children: React.ReactNode; onClick: () => void; ariaLabel: string; color?: string; filled?: boolean }) {
  return (
    <button
      onClick={onClick} aria-label={ariaLabel}
      style={{
        width: 38, height: 38, borderRadius: '50%',
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)',
        border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color, boxShadow: '0 2px 8px rgba(0,0,0,0.15)', flexShrink: 0,
      }}
    >
      {children}
      {filled && <span style={{ position: 'absolute' }} />}
    </button>
  )
}

export default function ProducteurPageClient({ id, onBack }: { id: string; onBack?: () => void }) {
  const { user, profile } = useAuth()
  const { openAuthModal } = useAuthModal()
  const isAdmin = useAdminSession()
  const goBack = useSmartBack('/')
  const [producer, setProducer] = useState<Producer | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [photoIdx, setPhotoIdx] = useState(0)
  // Carousel infinite avec clones + drag-following
  // internalIdx: 0 = clone du dernier, 1..N = vraies photos, N+1 = clone du premier
  const [internalIdx, setInternalIdx] = useState(1)
  const [transitionEnabled, setTransitionEnabled] = useState(true)
  const [dragOffsetPx, setDragOffsetPx] = useState(0)
  const carouselWidthRef = useRef<number>(390)
  const touchStartXRef = useRef<number | null>(null)
  const lastInteractionRef = useRef<number>(Date.now())
  const photosLenRef = useRef<number>(0)
  // Claim system (mirror etablissement)
  const [claimOpen, setClaimOpen] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [isFav, setIsFav] = useState(false)
  const [isFollowing, setIsFollowing] = useState(false)
  const [favoriteCount, setFavoriteCount] = useState(0)
  const [commentCount, setCommentCount] = useState(0)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentText, setCommentText] = useState('')
  const [sendingComment] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [productCatFilter, setProductCatFilter] = useState<string | null>(null)
  const [tab, setTab] = useState<'produits' | 'infos' | 'avis'>('produits')
  const isOwner = !!user && !!producer && producer.user_id === user.id
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editCommentText, setEditCommentText] = useState('')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const tabsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`/api/producers/${id}`)
      .then(r => r.json())
      .then(d => {
        setProducer(d.producer ?? null); setLoading(false)
        // Auto-edit mode si ?edit=1 (vient du redirect post-claim)
        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search)
          if (params.get('edit') === '1' && d.producer?.user_id === user?.id) {
            setTab('produits')
            setEditMode(true)
            toast.success('Fiche attribuée — ajoute tes produits')
            // Clean URL pour éviter le re-trigger sur refresh
            window.history.replaceState({}, '', `/producteur/${id}`)
            setTimeout(() => tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300)
          }
        }
      })
      .catch(() => setLoading(false))
  }, [id, user?.id])

  // Favorite count public
  useEffect(() => {
    supabase.from('producer_favorites').select('*', { count: 'exact', head: true }).eq('producer_id', id)
      .then(({ count }) => setFavoriteCount(count ?? 0))
  }, [id])

  useEffect(() => {
    async function loadComments() {
      const { data: raw } = await supabase.from('producer_comments').select('id, user_id, content, parent_id, created_at').eq('producer_id', id).order('created_at', { ascending: true })
      if (!raw || raw.length === 0) { setComments([]); setCommentCount(0); return }
      const uids = Array.from(new Set(raw.map((c: { user_id: string }) => c.user_id)))
      const { data: profiles } = await supabase.from('profiles').select('user_id, display_name, avatar_url').in('user_id', uids)
      const pmap = Object.fromEntries((profiles ?? []).map((p: { user_id: string; display_name: string | null; avatar_url: string | null }) => [p.user_id, p]))
      const loaded = raw.map((c: { id: string; user_id: string; content: string; parent_id: string | null; created_at: string }) => ({ ...c, profile: pmap[c.user_id] ?? null }))
      setComments(loaded); setCommentCount(loaded.length)
    }
    loadComments()
  }, [id])

  useEffect(() => {
    const channel = supabase.channel(`comments-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'producer_comments', filter: `producer_id=eq.${id}` },
        async ({ new: c }) => {
          const incoming = c as { id: string; user_id: string; content: string; parent_id: string | null; created_at: string }
          const { data: profile } = await supabase.from('profiles').select('user_id, display_name, avatar_url').eq('user_id', incoming.user_id).maybeSingle()
          setComments(prev => { if (prev.some(x => x.id === incoming.id)) return prev; setCommentCount(n => n + 1); return [...prev, { ...incoming, profile: profile ?? null }] })
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'producer_comments', filter: `producer_id=eq.${id}` },
        ({ old: c }) => { setComments(prev => prev.filter(x => x.id !== (c as { id: string }).id)); setCommentCount(n => n - 1) })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id])

  const loadProducts = useCallback(() => {
    supabase.from('products').select('id, nom, categorie, prix_indicatif, periode_dispo, disponible, image_url')
      .eq('producer_id', id).eq('disponible', true).order('categorie', { ascending: true })
      .then(({ data }) => setProducts(data ?? []))
  }, [id])

  useEffect(() => { loadProducts() }, [loadProducts])

  useEffect(() => {
    if (!user) { setIsFav(false); setIsFollowing(false); return }
    supabase.auth.getSession().then(({ data: { session } }) => {
      const token = session?.access_token; if (!token) return
      Promise.all([
        fetch(`/api/producers/${id}/favorite`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
        fetch(`/api/producers/${id}/follow`,   { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      ]).then(([fav, fol]) => { setIsFav(!!fav.favorited); setIsFollowing(!!fol.following) })
    })
  }, [user?.id, id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync photosLenRef + photoIdx ↔ internalIdx
  useEffect(() => {
    const photos = producer?.photos ?? []
    photosLenRef.current = photos.length
    if (photos.length <= 1) {
      setInternalIdx(1)
      setPhotoIdx(0)
    }
  }, [producer?.photos])

  // Auto-advance toutes les 5s si user idle
  useEffect(() => {
    if (photosLenRef.current <= 1) return
    const interval = setInterval(() => {
      const idleMs = Date.now() - lastInteractionRef.current
      if (idleMs < 5000) return
      setInternalIdx(i => i + 1) // avance dans le strip, snap-back gère le loop
    }, 5000)
    return () => clearInterval(interval)
  }, [producer?.photos])

  // Au end de transition, snap-back invisible si on est sur un clone
  const handleStripTransitionEnd = () => {
    const N = photosLenRef.current
    if (N <= 1) return
    const stripLen = N + 2
    if (internalIdx === 0) {
      setTransitionEnabled(false)
      setInternalIdx(N)
      requestAnimationFrame(() => requestAnimationFrame(() => setTransitionEnabled(true)))
    } else if (internalIdx === stripLen - 1) {
      setTransitionEnabled(false)
      setInternalIdx(1)
      requestAnimationFrame(() => requestAnimationFrame(() => setTransitionEnabled(true)))
    }
  }

  // Sync displayed photoIdx (0..N-1) from internalIdx for dots/counter
  useEffect(() => {
    const N = photosLenRef.current
    if (N <= 1) { setPhotoIdx(0); return }
    const stripLen = N + 2
    const display = internalIdx === 0 ? N - 1 : internalIdx === stripLen - 1 ? 0 : internalIdx - 1
    setPhotoIdx(display)
  }, [internalIdx])

  const onPhotoTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX
    lastInteractionRef.current = Date.now()
    setTransitionEnabled(false) // pendant le drag, pas de transition
    carouselWidthRef.current = e.currentTarget.getBoundingClientRect().width || 390
  }
  const onPhotoTouchMove = (e: React.TouchEvent) => {
    if (touchStartXRef.current == null || photosLenRef.current <= 1) return
    const dx = e.touches[0].clientX - touchStartXRef.current
    setDragOffsetPx(dx)
  }
  const onPhotoTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current == null || photosLenRef.current <= 1) {
      touchStartXRef.current = null; setDragOffsetPx(0); setTransitionEnabled(true); return
    }
    const dx = e.changedTouches[0].clientX - touchStartXRef.current
    const threshold = carouselWidthRef.current * 0.18 // 18% de la largeur = swipe valide
    setDragOffsetPx(0)
    setTransitionEnabled(true)
    if (Math.abs(dx) > threshold) {
      setInternalIdx(i => dx < 0 ? i + 1 : i - 1)
      lastInteractionRef.current = Date.now()
    }
    touchStartXRef.current = null
  }

  const availableCats = useMemo(() => Array.from(new Set(products.map(p => normalizeProduitCat(p.categorie)))), [products])
  const filteredProducts = useMemo(() =>
    productCatFilter ? products.filter(p => normalizeProduitCat(p.categorie) === productCatFilter) : products,
    [products, productCatFilter])

  const dispoSemaineCount = useMemo(() => products.filter(p => p.periode_dispo === 'semaine').length, [products])
  const actifCetteSemaine = dispoSemaineCount > 0

  async function toggleFav() {
    if (!user) { openAuthModal(); return }
    const next = !isFav
    setIsFav(next)
    setFavoriteCount(c => Math.max(0, c + (next ? 1 : -1)))
    toast.success(next ? 'Ajouté aux favoris' : 'Retiré des favoris')
    const { data: { session } } = await supabase.auth.getSession(); const token = session?.access_token
    if (!token) { setIsFav(!next); setFavoriteCount(c => Math.max(0, c + (next ? -1 : 1))); return }
    const res = await fetch(`/api/producers/${id}/favorite`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) { setIsFav(!next); setFavoriteCount(c => Math.max(0, c + (next ? -1 : 1))) }
  }
  async function toggleFollow() {
    if (!user) { openAuthModal(); return }
    const next = !isFollowing
    setIsFollowing(next)
    toast.success(next ? 'Vous suivez ce producteur' : 'Abonnement retiré')
    const { data: { session } } = await supabase.auth.getSession(); const token = session?.access_token; if (!token) { setIsFollowing(!next); return }
    const res = await fetch(`/api/producers/${id}/follow`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) setIsFollowing(!next)
  }
  async function deleteComment(commentId: string) {
    const { data: { session } } = await supabase.auth.getSession(); const token = session?.access_token; if (!token) return
    const res = await fetch(`/api/producers/${id}/comments/${commentId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) { setComments(prev => prev.filter(c => c.id !== commentId)); setCommentCount(n => n - 1) }
  }
  async function saveEditComment(commentId: string) {
    if (!editCommentText.trim()) return
    const { data: { session } } = await supabase.auth.getSession(); const token = session?.access_token; if (!token) return
    const res = await fetch(`/api/producers/${id}/comments/${commentId}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ content: editCommentText.trim() }) })
    if (res.ok) { const d = await res.json(); setComments(prev => prev.map(c => c.id === commentId ? { ...c, content: d.content } : c)); setEditingCommentId(null) }
  }
  async function sendComment() {
    if (!user) { openAuthModal(); return }
    if (!commentText.trim() || sendingComment) return
    const text = commentText.trim()
    const tempId = `temp-${Date.now()}`
    const tempComment = { id: tempId, user_id: user.id, content: text, parent_id: null, created_at: new Date().toISOString(), profile: profile ? { user_id: user.id, display_name: profile.display_name, avatar_url: profile.avatar_url } : null }
    setComments(prev => [...prev, tempComment])
    setCommentCount(n => n + 1)
    setCommentText('')
    const { data: { session } } = await supabase.auth.getSession(); const token = session?.access_token
    if (!token) return
    const res = await fetch(`/api/producers/${id}/comments`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ content: text }) })
    if (res.ok) { const d = await res.json(); setComments(prev => prev.map(c => c.id === tempId ? d.comment : c)) }
    else { setComments(prev => prev.filter(c => c.id !== tempId)); setCommentCount(n => n - 1) }
  }
  function share() {
    const url = window.location.href
    if (navigator.share) navigator.share({ title: producer?.nom ?? '', url }).catch(() => {})
    else { navigator.clipboard.writeText(url).catch(() => {}); toast.success('Lien copié') }
  }

  // Routing 3-voies pour "Revendiquer cette fiche producteur"
  // (mirror etablissement claim)
  async function handleClaimClick() {
    if (!user) {
      openAuthModal(`${window.location.origin}/producteur/${id}`)
      return
    }
    const ctx = toUserContext(profile, isAdmin)
    if (!can(ctx, 'open_shop')) {
      setClaimOpen(true)
      return
    }
    setClaiming(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch(`/api/producers/${id}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        if (data.autoApproved) {
          // Hard reload avec ?edit=1 — garantit l'état serveur frais
          // (sinon optimistic update peut être écrasé par cache PostgREST)
          window.location.href = `/producteur/${id}?edit=1`
        } else {
          toast.success('Demande envoyée')
        }
      } else {
        const d = await res.json().catch(() => ({}))
        toast.error(d.error ?? 'Erreur lors de la demande')
      }
    } finally {
      setClaiming(false)
    }
  }
  function scrollToAvis() {
    setTab('avis')
    setTimeout(() => tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  if (loading) return <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: T.creme }}><div style={{ width: 32, height: 32, borderRadius: '50%', border: `4px solid ${T.bord}`, borderTopColor: T.primary, animation: 'spin 0.7s linear infinite' }} /></div>
  if (!producer) return <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: T.creme }}><p style={{ color: T.texteDoux, fontFamily: 'var(--font-body), sans-serif' }}>Producteur introuvable</p></div>

  const photos = producer.photos ?? []
  const mapsUrl = producer.lat && producer.lng
    ? `https://www.google.com/maps/dir/?api=1&destination=${producer.lat},${producer.lng}`
    : producer.adresse ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(producer.adresse)}` : null
  const dispoPeriodLabel = products.some(p => p.periode_dispo === 'semaine') ? 'Cette semaine'
    : products.some(p => p.periode_dispo === 'weekend') ? 'Ce weekend'
    : products.length > 0 ? 'En vente' : null

  const tabsList: { id: 'produits' | 'infos' | 'avis'; label: string; count: number | null }[] = [
    { id: 'produits', label: 'Produits', count: products.length },
    { id: 'infos', label: 'Infos', count: null },
    { id: 'avis', label: 'Avis', count: commentCount },
  ]

  return (
    <div style={{ minHeight: '100dvh', backgroundColor: T.creme, fontFamily: 'var(--font-body), sans-serif', color: T.texte }}>

      {/* Floating top actions */}
      <div style={{ position: 'absolute', top: 14, left: 0, right: 0, padding: '0 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 20 }}>
        <FloatBtn ariaLabel="Retour" onClick={() => onBack ? onBack() : goBack()}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
        </FloatBtn>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isAdmin && <FeatureButton contentType="producteur" contentId={producer.id} ownerUserId={(producer as { user_id?: string | null }).user_id ?? null} />}
          {isAdmin && !isOwner && (
            <button onClick={() => setEditing(true)} style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.primary, boxShadow: '0 2px 8px rgba(0,0,0,0.15)', flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
          )}
          <FloatBtn ariaLabel="Partager" onClick={share}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          </FloatBtn>
          <FloatBtn ariaLabel="Favori" onClick={toggleFav} color={isFav ? T.accent : T.texte}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill={isFav ? T.accent : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </FloatBtn>
        </div>
      </div>

      {/* Hero photo 290px — carousel infinite (clones + drag-following) */}
      <div
        style={{ position: 'relative', width: '100%', height: 290, background: '#E8F2EB', overflow: 'hidden', touchAction: 'pan-y' }}
        onTouchStart={onPhotoTouchStart}
        onTouchMove={onPhotoTouchMove}
        onTouchEnd={onPhotoTouchEnd}
      >
        {photos.length === 0 ? (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src="/icons/producteur-local.png" alt="" style={{ width: 100, opacity: 0.3 }} />
          </div>
        ) : photos.length === 1 ? (
          <img src={photos[0]} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', userSelect: 'none', pointerEvents: 'none' }} />
        ) : (() => {
          const stripPhotos = [photos[photos.length - 1], ...photos, photos[0]] // clones début/fin
          const stripLen = stripPhotos.length
          const slideWidthPercent = 100 / stripLen
          const baseTranslatePercent = internalIdx * slideWidthPercent
          // Combine % base + px drag pour un mouvement smooth qui suit le doigt
          return (
            <div
              onTransitionEnd={handleStripTransitionEnd}
              style={{
                display: 'flex', height: '100%', width: `${stripLen * 100}%`,
                transform: `translate3d(calc(-${baseTranslatePercent}% + ${dragOffsetPx}px), 0, 0)`,
                transition: transitionEnabled ? 'transform 0.4s cubic-bezier(0.25, 0.1, 0.25, 1)' : 'none',
                willChange: 'transform',
              }}
            >
              {stripPhotos.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt=""
                  draggable={false}
                  style={{
                    width: `${slideWidthPercent}%`, height: '100%',
                    objectFit: 'cover', flexShrink: 0, userSelect: 'none', pointerEvents: 'none',
                  }}
                />
              ))}
            </div>
          )
        })()}
        {/* Gradient bas pour lisibilité dots/badge */}
        <div style={{ position: 'absolute', inset: 'auto 0 0 0', height: 140, background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.45) 100%)', pointerEvents: 'none' }} />

        {/* Photo counter top-right */}
        {photos.length > 1 && (
          <div style={{ position: 'absolute', top: 14, right: '50%', transform: 'translateX(50%)', fontSize: 11, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,0.45)', padding: '4px 8px', borderRadius: 999, backdropFilter: 'blur(4px)', zIndex: 7 }}>
            {photoIdx + 1}/{photos.length}
          </div>
        )}

        {/* Badge PRODUCTEUR LOCAL — remonté pour ne pas passer sous le content card */}
        <div style={{ position: 'absolute', bottom: 36, left: 14, zIndex: 5 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(232,242,235,0.95)', backdropFilter: 'blur(4px)', color: T.primary, fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', padding: '5px 10px', borderRadius: 999 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19.2 2.96c1.4 9.3-3.6 15.8-8.2 17.04z"/><path d="M2 21c0-3 1.85-5.36 5.08-6"/></svg>
            PRODUCTEUR LOCAL
          </div>
          {producer.is_featured && <span style={{ marginLeft: 6, backgroundColor: '#F5EFD6', color: '#8B6914', borderRadius: 999, padding: '4px 10px', fontSize: 10, fontWeight: 800 }}>★ À la une</span>}
        </div>

        {/* Dots — remonté à 36 pour rester au-dessus du content card slide-up (-20) */}
        {photos.length > 1 && (
          <div style={{ position: 'absolute', bottom: 36, right: 14, zIndex: 5, display: 'flex', gap: 5, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(6px)', padding: '5px 10px', borderRadius: 999 }}>
            {photos.map((_, i) => (
              <span
                key={i}
                onClick={() => { setInternalIdx(i + 1); lastInteractionRef.current = Date.now() }}
                style={{ width: i === photoIdx ? 14 : 4, height: 4, background: i === photoIdx ? '#fff' : 'rgba(255,255,255,0.55)', borderRadius: i === photoIdx ? 2 : '50%', cursor: 'pointer', transition: 'width 0.18s' }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Content card slide up */}
      <div style={{ background: T.white, borderRadius: '24px 24px 0 0', marginTop: -20, position: 'relative', zIndex: 4, paddingBottom: 100 }}>
        {/* Title block */}
        <div style={{ padding: '20px 16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <h1 style={{ margin: 0, fontFamily: 'var(--font-display), Georgia, serif', fontSize: 28, lineHeight: 1.1, color: T.texte, letterSpacing: '-0.02em', fontWeight: 400 }}>
              {producer.nom}
            </h1>
            {favoriteCount > 0 && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: T.accent, fontSize: 13, fontWeight: 800, flexShrink: 0, marginTop: 6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill={T.accent} stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                {favoriteCount}
              </div>
            )}
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: T.texteDoux, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {actifCetteSemaine && (
              <span style={{ color: T.primary, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, background: T.primary, borderRadius: '50%' }} />
                Actif cette semaine
              </span>
            )}
          </div>
          {producer.commune && (
            <div style={{ marginTop: 10, fontSize: 12, color: T.texteDoux, display: 'flex', alignItems: 'center', gap: 5 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              {producer.adresse ? `${producer.adresse} · ${producer.commune}` : producer.commune}
            </div>
          )}
          {producer.description_courte && (
            <p style={{ marginTop: 12, fontSize: 14, color: T.texte, lineHeight: 1.6, margin: '12px 0 0' }}>
              {producer.description_courte}
            </p>
          )}
        </div>

        {/* Claim card — visible si pas owner et pas encore claim */}
        {!isOwner && !producer.user_id && (
          <div style={{ padding: '14px 16px 0' }}>
            <div style={{
              padding: '14px 16px', borderRadius: 16,
              background: '#FDFAF5', border: `1.5px dashed ${T.bord}`,
            }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: T.texte, margin: '0 0 4px' }}>
                Vous êtes ce producteur ?
              </p>
              <p style={{ fontSize: 12, color: T.texteDoux, lineHeight: 1.5, margin: '0 0 12px' }}>
                Revendiquez cette fiche pour la compléter et la gérer.
              </p>
              <button
                onClick={handleClaimClick}
                disabled={claiming}
                style={{
                  padding: '10px 20px', borderRadius: 999,
                  background: T.primary, color: '#fff', border: 'none',
                  fontWeight: 700, fontSize: 13, cursor: claiming ? 'wait' : 'pointer',
                  opacity: claiming ? 0.6 : 1, fontFamily: 'inherit',
                }}
              >
                {claiming ? '…' : 'Revendiquer cette fiche'}
              </button>
            </div>
          </div>
        )}

        {/* Follow banner */}
        {producer.user_id !== user?.id && (
          <div style={{ padding: '18px 16px 0' }}>
            <div style={{
              background: isFollowing ? T.primaryLight : T.white,
              border: isFollowing ? `1.5px solid ${T.primary}` : `1px solid ${T.bordSoft}`,
              borderRadius: 16, padding: '12px 14px',
              display: 'flex', alignItems: 'center', gap: 14,
              boxShadow: isFollowing ? 'none' : '0 1px 4px rgba(44,28,16,0.04)',
            }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: isFollowing ? T.white : T.primaryLight, color: T.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: T.texte, lineHeight: 1.2, letterSpacing: '-0.01em' }}>
                  {isFollowing ? 'Tu suis ce producteur' : 'Suivre ce producteur'}
                </div>
                <div style={{ fontSize: 11, color: T.texteDoux, marginTop: 2, lineHeight: 1.4 }}>
                  {isFollowing ? 'Tu seras notifié dès qu\'il publie un nouveau produit.' : 'Recevoir une notif dès qu\'il publie de nouveaux produits.'}
                </div>
              </div>
              <button
                onClick={toggleFollow}
                style={{
                  padding: '8px 14px', borderRadius: 999,
                  background: isFollowing ? T.white : T.primary,
                  color: isFollowing ? T.primary : '#fff',
                  border: isFollowing ? `1px solid ${T.primary}` : 'none',
                  fontSize: 12, fontWeight: 800, cursor: 'pointer', flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'inherit',
                }}
              >
                {isFollowing ? (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Suivi
                  </>
                ) : 'Suivre'}
              </button>
            </div>
          </div>
        )}

        {/* Dispo chips */}
        {(dispoPeriodLabel || producer.vente_directe !== false || producer.retrait_sur_place !== false) && (
          <div style={{ padding: '18px 16px 0', display: 'flex', gap: 8 }}>
            {dispoPeriodLabel && (
              <div style={{ flex: 1, minWidth: 0, background: T.primaryLight, border: '1px solid #C5DCC9', borderRadius: 12, padding: '9px 10px' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: T.primary, letterSpacing: '-0.01em', lineHeight: 1.2 }}>{dispoPeriodLabel}</div>
                <div style={{ fontSize: 10, color: '#5A8A6A', marginTop: 2, lineHeight: 1.2 }}>{dispoSemaineCount > 0 ? `${dispoSemaineCount} produits dispos` : 'En vente'}</div>
              </div>
            )}
            {producer.vente_directe !== false && (
              <div style={{ flex: 1, minWidth: 0, background: T.cremeDeep, border: `1px solid ${T.bordSoft}`, borderRadius: 12, padding: '9px 10px' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: T.texte, letterSpacing: '-0.01em', lineHeight: 1.2 }}>Vente directe</div>
                <div style={{ fontSize: 10, color: T.texteDoux, marginTop: 2, lineHeight: 1.2 }}>Du producteur</div>
              </div>
            )}
            {producer.retrait_sur_place !== false && (
              <div style={{ flex: 1, minWidth: 0, background: T.cremeDeep, border: `1px solid ${T.bordSoft}`, borderRadius: 12, padding: '9px 10px' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: T.texte, letterSpacing: '-0.01em', lineHeight: 1.2 }}>À retirer</div>
                <div style={{ fontSize: 10, color: T.texteDoux, marginTop: 2, lineHeight: 1.2 }}>Sur place / marché</div>
              </div>
            )}
          </div>
        )}

        <div style={{ height: 18 }} />

        {/* Tabs sticky */}
        <div ref={tabsRef} style={{ position: 'sticky', top: 0, zIndex: 10, background: T.white, borderBottom: `1px solid ${T.bordSoft}`, padding: '0 16px' }}>
          <div style={{ display: 'flex', gap: 0 }}>
            {tabsList.map(t => {
              const active = tab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  style={{
                    flex: 1, padding: '14px 8px',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    borderBottom: active ? `2.5px solid ${T.primary}` : '2.5px solid transparent',
                    fontSize: 13, fontWeight: active ? 800 : 600,
                    color: active ? T.primary : T.texteDoux,
                    letterSpacing: '0.02em',
                    fontFamily: 'var(--font-body), sans-serif',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  }}
                >
                  {t.label}
                  {t.count != null && t.count > 0 && (
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      color: active ? T.primary : T.texteTresDoux,
                      background: active ? T.primaryLight : T.cremeDeep,
                      padding: '1px 6px', borderRadius: 999,
                    }}>{t.count}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Tab Produits */}
        {tab === 'produits' && (
          <div style={{ padding: '18px 16px 0' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: T.texteDoux, letterSpacing: '0.1em' }}>DISPONIBLES MAINTENANT</div>
                <div style={{ fontSize: 11, color: T.texteTresDoux, marginTop: 2 }}>
                  Mis à jour par le producteur · {products.length} produits
                </div>
              </div>
              {isOwner && (
                <button
                  onClick={() => { if (editMode) loadProducts(); setEditMode(e => !e); setProductCatFilter(null) }}
                  style={{ padding: '6px 14px', borderRadius: 10, border: `1.5px solid ${T.primary}`, fontSize: 12, fontWeight: 700, color: editMode ? '#fff' : T.primary, background: editMode ? T.primary : 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  {editMode ? '✓ Publier' : '✏️ Gérer'}
                </button>
              )}
            </div>

            {isOwner && editMode ? (
              <ProductsEditSection producerId={producer.id} />
            ) : products.length === 0 ? (
              <p style={{ fontSize: 13, color: T.texteTresDoux, textAlign: 'center', padding: '8px 18px 24px', margin: 0 }}>Aucun produit disponible actuellement</p>
            ) : (
              <>
                {availableCats.length > 1 && (
                  <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 12, scrollbarWidth: 'none' }}>
                    <button onClick={() => setProductCatFilter(null)} style={{ flexShrink: 0, padding: '5px 11px', borderRadius: 999, background: !productCatFilter ? T.primary : T.cremeDeep, color: !productCatFilter ? '#fff' : T.texteDoux, border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Tout</button>
                    {availableCats.map(cat => {
                      const info = PRODUIT_CATS_MAP[cat]
                      const active = productCatFilter === cat
                      return (
                        <button key={cat} onClick={() => setProductCatFilter(active ? null : cat)} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, padding: '5px 11px', borderRadius: 999, background: active ? T.primary : T.cremeDeep, color: active ? '#fff' : T.texteDoux, border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
                          {info?.emoji} {info?.label ?? cat}
                        </button>
                      )
                    })}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {filteredProducts.map(p => {
                    const catInfo = PRODUIT_CATS_MAP[normalizeProduitCat(p.categorie)]
                    const periodLabel = p.periode_dispo === 'semaine' ? 'Cette sem.' : p.periode_dispo === 'weekend' ? 'Ce weekend' : null
                    const periodColor = p.periode_dispo === 'semaine' ? T.primary : '#C4622D'
                    return (
                      <div key={p.id} style={{ background: T.white, borderRadius: 14, overflow: 'hidden', border: `1px solid ${T.bordSoft}`, boxShadow: '0 1px 4px rgba(44,28,16,0.04)' }}>
                        <div style={{ height: 120, background: '#E8F2EB', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', fontSize: 42 }}>
                          {p.image_url ? (
                            <>
                              <img src={p.image_url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.15), transparent 55%)' }} />
                            </>
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44 }}>{catInfo?.emoji ?? '✦'}</div>
                          )}
                          {periodLabel && (
                            <span style={{ position: 'absolute', top: 8, left: 8, zIndex: 2, fontSize: 9, fontWeight: 800, color: periodColor, background: 'rgba(255,255,255,0.94)', borderRadius: 999, padding: '3px 8px', backdropFilter: 'blur(4px)', letterSpacing: '0.02em' }}>{periodLabel}</span>
                          )}
                        </div>
                        <div style={{ padding: '9px 11px 11px' }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: T.texte, lineHeight: 1.3, marginBottom: 3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 34 }}>{p.nom}</div>
                          {p.prix_indicatif ? (
                            <div style={{ fontSize: 14, fontWeight: 800, color: T.primary, letterSpacing: '-0.01em' }}>{p.prix_indicatif}</div>
                          ) : (
                            <div style={{ fontSize: 11, color: T.texteTresDoux }}>Prix sur demande</div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Tab Infos */}
        {tab === 'infos' && (
          <>
            {producer.description_longue && (
              <div style={{ padding: '18px 16px 0' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: T.texteDoux, letterSpacing: '0.1em', marginBottom: 8 }}>À PROPOS</div>
                <p style={{ margin: 0, fontSize: 14, color: T.texte, lineHeight: 1.6 }}>{producer.description_longue}</p>
              </div>
            )}

            {(producer.contact_tel || producer.contact_whatsapp || producer.site_web || mapsUrl) && (
              <>
                <div style={{ height: 22 }} />
                <div style={{ height: 1, background: T.bordSoft, margin: '0 16px' }} />
                <div style={{ padding: '18px 16px 0' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: T.texteDoux, letterSpacing: '0.1em', marginBottom: 6 }}>CONTACT</div>
                  {producer.contact_tel && (
                    <a href={`tel:${producer.contact_tel}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', textDecoration: 'none', borderBottom: `1px solid ${T.bordSoft}` }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: T.primaryLight, color: T.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: T.texteDoux, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Téléphone</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: T.texte, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{producer.contact_tel}</div>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.texteTresDoux} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18"/></svg>
                    </a>
                  )}
                  {producer.contact_whatsapp && (
                    <a href={`https://wa.me/${producer.contact_whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', textDecoration: 'none', borderBottom: `1px solid ${T.bordSoft}` }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: T.primaryLight, color: T.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: T.texteDoux, letterSpacing: '0.04em', textTransform: 'uppercase' }}>WhatsApp</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: T.texte, marginTop: 2 }}>Écrire un message</div>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.texteTresDoux} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18"/></svg>
                    </a>
                  )}
                  {producer.site_web && (
                    <a href={producer.site_web.startsWith('http') ? producer.site_web : `https://${producer.site_web}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', textDecoration: 'none', borderBottom: mapsUrl ? `1px solid ${T.bordSoft}` : 'none' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: T.primaryLight, color: T.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: T.texteDoux, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Site web</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: T.texte, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{producer.site_web.replace(/^https?:\/\//, '').replace(/\/$/, '')}</div>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.texteTresDoux} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18"/></svg>
                    </a>
                  )}
                  {mapsUrl && (
                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', textDecoration: 'none' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: T.primaryLight, color: T.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: T.texteDoux, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Itinéraire</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: T.texte, marginTop: 2 }}>{producer.adresse ?? producer.commune ?? 'Voir sur la carte'}</div>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.texteTresDoux} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18"/></svg>
                    </a>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* Tab Avis */}
        {tab === 'avis' && (
          <div style={{ padding: '18px 16px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: T.texteDoux, letterSpacing: '0.1em' }}>
                AVIS DES VOISINS {commentCount > 0 && `· ${commentCount}`}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <Avatar name={profile?.display_name || user?.email || '?'} url={profile?.avatar_url} size={34} />
              <div style={{ flex: 1, display: 'flex', gap: 8 }}>
                <input
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendComment()}
                  placeholder={user ? 'Votre avis…' : 'Connectez-vous pour commenter'}
                  style={{ flex: 1, padding: '9px 13px', borderRadius: 12, border: `1.5px solid ${T.bord}`, fontSize: 13, fontFamily: 'inherit', outline: 'none', color: T.texte, background: T.cremeDeep }}
                  onClick={() => { if (!user) openAuthModal() }}
                />
                <button
                  onClick={sendComment} disabled={!commentText.trim() || sendingComment}
                  style={{ padding: '9px 16px', borderRadius: 12, border: 'none', background: commentText.trim() && !sendingComment ? T.primary : '#D8D0C8', color: '#fff', fontWeight: 700, fontSize: 13, cursor: commentText.trim() && !sendingComment ? 'pointer' : 'default', fontFamily: 'inherit' }}
                >→</button>
              </div>
            </div>

            {comments.length === 0 && <p style={{ fontSize: 13, color: T.texteTresDoux, textAlign: 'center', margin: 0 }}>Soyez le premier à donner votre avis !</p>}
            {comments.map(c => (
              <div key={c.id} style={{ display: 'flex', gap: 10, padding: '10px 0', borderTop: `1px dashed ${T.bord}` }}>
                <Avatar name={c.profile?.display_name || '?'} url={c.profile?.avatar_url} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <a href={`/profil/${c.user_id}`} style={{ fontSize: 13, fontWeight: 700, color: T.texte, textDecoration: 'none' }}>{c.profile?.display_name ?? 'Anonyme'}</a>
                    {c.user_id === user?.id && editingCommentId !== c.id && (
                      <div style={{ position: 'relative' }}>
                        <button onClick={() => setOpenMenuId(openMenuId === c.id ? null : c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.texteDoux, fontSize: 18 }}>⋮</button>
                        {openMenuId === c.id && (
                          <div style={{ position: 'absolute', right: 0, top: '110%', background: T.white, borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.13)', zIndex: 20, minWidth: 150, overflow: 'hidden' }}>
                            <button onClick={() => { setEditingCommentId(c.id); setEditCommentText(c.content); setOpenMenuId(null) }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: T.texte, fontFamily: 'inherit' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              Modifier
                            </button>
                            <div style={{ height: 1, background: T.bordSoft, margin: '0 14px' }} />
                            <button onClick={() => { deleteComment(c.id); setOpenMenuId(null) }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: T.accent, fontFamily: 'inherit' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                              Supprimer
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: T.texteTresDoux, marginTop: 1 }}>{timeAgo(c.created_at)}</div>
                  {editingCommentId === c.id ? (
                    <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
                      <input value={editCommentText} onChange={e => setEditCommentText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEditComment(c.id); if (e.key === 'Escape') setEditingCommentId(null) }} autoFocus style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: `1.5px solid ${T.primary}`, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: T.white }} />
                      <button onClick={() => saveEditComment(c.id)} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: T.primary, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>✓</button>
                      <button onClick={() => setEditingCommentId(null)} style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${T.bord}`, background: 'transparent', fontSize: 12, cursor: 'pointer' }}>✕</button>
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: T.texte, lineHeight: 1.5, marginTop: 5 }}>{c.content}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Banner local */}
        <div style={{ padding: '22px 16px 0' }}>
          <div style={{ background: 'linear-gradient(135deg, #2D5A3D 0%, #3A7050 100%)', borderRadius: 16, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 3px 12px rgba(45,90,61,0.2)' }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(255,255,255,0.18)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19.2 2.96c1.4 9.3-3.6 15.8-8.2 17.04z"/><path d="M2 21c0-3 1.85-5.36 5.08-6"/></svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>Soutenez vos producteurs locaux</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.78)', marginTop: 3, lineHeight: 1.4 }}>
                Acheter local, c&apos;est soutenir une agriculture durable et humaine.
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Sticky bottom bar */}
      {(producer.contact_tel || mapsUrl) && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: T.white, borderTop: `1px solid #EDE8E0`, padding: '12px 16px 16px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 -4px 16px rgba(44,28,16,0.04)', zIndex: 30, paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))' }}>
          {producer.contact_tel && (
            <a href={`tel:${producer.contact_tel}`} style={{ width: 48, height: 48, borderRadius: 14, background: T.white, border: `1px solid ${T.bord}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, color: T.texte, textDecoration: 'none' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            </a>
          )}
          {mapsUrl ? (
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ flex: 1, height: 48, borderRadius: 14, background: T.primary, color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none', fontFamily: 'inherit' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
              Itinéraire
            </a>
          ) : (
            <button onClick={scrollToAvis} style={{ flex: 1, height: 48, borderRadius: 14, background: T.primary, color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}>
              Voir les avis
            </button>
          )}
        </div>
      )}

      {editing && producer && <ProducerEditDrawer producer={producer} onClose={() => setEditing(false)} onSaved={updated => setProducer(updated)} />}

      {/* Modale upgrade plan si user pas Pro */}
      {claimOpen && (
        <SubscriptionModal
          context={{ kind: 'feature', featureLabel: 'Revendiquer une fiche producteur', minPlan: 'pro' }}
          onClose={() => setClaimOpen(false)}
          currentPlan={(profile?.plan as 'basic' | 'habitants' | 'pro') ?? 'basic'}
        />
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <BottomNavBar />
    </div>
  )
}
