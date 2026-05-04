'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import { useAdminSession } from '@/hooks/useAdminSession'
import { PRODUIT_CATS_MAP, PRODUIT_CAT_ICONS, normalizeProduitCat } from '@/lib/produit-cats'
import ProducerEditDrawer from '@/components/ProducerEditDrawer'

interface Producer {
  id: string; nom: string; description_courte: string | null; description_longue: string | null
  commune: string | null; adresse: string | null; lat: number | null; lng: number | null
  contact_tel: string | null; contact_whatsapp: string | null; site_web: string | null
  photos: string[]; is_max: boolean; is_featured: boolean; user_id?: string | null
  vente_directe?: boolean | null; retrait_sur_place?: boolean | null
}
interface Product { id: string; nom: string; categorie: string; prix_indicatif: string | null; periode_dispo: string | null }
interface Comment {
  id: string; user_id: string; content: string; parent_id: string | null; created_at: string
  profile: { id: string; display_name: string | null; avatar_url: string | null } | null
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
function InfoChip({ label, sub }: { label: string; sub: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, backgroundColor: '#E8F2EB', borderRadius: 14, padding: '9px 10px' }}>
      <div style={{ width: 22, height: 22, borderRadius: '50%', backgroundColor: '#2D5A3D', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#2D5A3D', margin: 0, lineHeight: 1.2 }}>{label}</p>
        <p style={{ fontSize: 10, color: '#5A8A6A', margin: 0, lineHeight: 1.2 }}>{sub}</p>
      </div>
    </div>
  )
}

export default function ProducteurPageClient({ id }: { id: string }) {
  const router = useRouter()
  const { user, profile } = useAuth()
  const { openAuthModal } = useAuthModal()
  const isAdmin = useAdminSession()
  const [producer, setProducer] = useState<Producer | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [photoIdx, setPhotoIdx] = useState(0)
  const [isFav, setIsFav] = useState(false)
  const [isFollowing, setIsFollowing] = useState(false)
  const [commentCount, setCommentCount] = useState(0)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentText, setCommentText] = useState('')
  const [sendingComment, setSendingComment] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editCommentText, setEditCommentText] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>()
  const commentsRef = useRef<HTMLDivElement>(null)

  const showToast = useCallback((msg: string) => {
    clearTimeout(toastTimer.current); setToast(msg)
    toastTimer.current = setTimeout(() => setToast(null), 2000)
  }, [])

  useEffect(() => {
    fetch(`/api/producers/${id}`)
      .then(r => r.json())
      .then(d => { setProducer(d.producer ?? null); setProducts(d.products ?? []); setLoading(false) })
      .catch(() => setLoading(false))
    fetch(`/api/producers/${id}/comments`)
      .then(r => r.json())
      .then(d => { const c = d.comments ?? []; setComments(c); setCommentCount(c.length) })
  }, [id])

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

  async function toggleFav() {
    if (!user) { openAuthModal(); return }
    const { data: { session } } = await supabase.auth.getSession(); const token = session?.access_token; if (!token) return
    const res = await fetch(`/api/producers/${id}/favorite`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    const { favorited } = await res.json(); setIsFav(favorited)
    showToast(favorited ? '❤️ Ajouté aux favoris' : 'Retiré des favoris')
  }
  async function toggleFollow() {
    if (!user) { openAuthModal(); return }
    const { data: { session } } = await supabase.auth.getSession(); const token = session?.access_token; if (!token) return
    const res = await fetch(`/api/producers/${id}/follow`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    const { following } = await res.json(); setIsFollowing(following)
    showToast(following ? '✓ Vous suivez ce producteur' : 'Abonnement retiré')
  }
  function scrollToComments() {
    commentsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  async function deleteComment(commentId: string) {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token; if (!token) return
    const res = await fetch(`/api/producers/${id}/comments/${commentId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) { setComments(prev => prev.filter(c => c.id !== commentId)); setCommentCount(n => n - 1) }
  }
  async function saveEditComment(commentId: string) {
    if (!editCommentText.trim()) return
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token; if (!token) return
    const res = await fetch(`/api/producers/${id}/comments/${commentId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: editCommentText.trim() }),
    })
    if (res.ok) {
      const d = await res.json()
      setComments(prev => prev.map(c => c.id === commentId ? { ...c, content: d.content } : c))
      setEditingCommentId(null)
    }
  }
  async function sendComment() {
    if (!user) { openAuthModal(); return }
    if (!commentText.trim() || sendingComment) return
    setSendingComment(true)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setSendingComment(false); return }
    const res = await fetch(`/api/producers/${id}/comments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: commentText.trim() }),
    })
    if (res.ok) {
      const d = await res.json()
      setComments(prev => [...prev, d.comment]); setCommentCount(n => n + 1); setCommentText('')
    }
    setSendingComment(false)
  }
  function share() {
    const url = window.location.href
    if (navigator.share) navigator.share({ title: producer?.nom ?? '', url }).catch(() => {})
    else { navigator.clipboard.writeText(url).catch(() => {}); showToast('Lien copié !') }
  }

  if (loading) return <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F0E8' }}><div style={{ width: 32, height: 32, borderRadius: '50%', border: '4px solid #E0D8CE', borderTopColor: '#2D5A3D', animation: 'spin 0.7s linear infinite' }} /></div>
  if (!producer) return <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F0E8' }}><p style={{ color: '#8A8A8A', fontFamily: 'Inter, sans-serif' }}>Producteur introuvable</p></div>

  const photos = producer.photos ?? []
  const mapsUrl = producer.lat && producer.lng
    ? `https://www.google.com/maps/dir/?api=1&destination=${producer.lat},${producer.lng}`
    : producer.adresse ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(producer.adresse)}` : null
  const byCategory: Record<string, Product[]> = {}
  products.forEach(p => { const cat = normalizeProduitCat(p.categorie); if (!byCategory[cat]) byCategory[cat] = []; byCategory[cat].push(p) })
  const dispoPeriodLabel = products.some(p => p.periode_dispo === 'semaine') ? 'Cette semaine'
    : products.some(p => p.periode_dispo === 'weekend') ? 'Ce weekend'
    : products.length > 0 ? 'En vente' : null

  const BTN: React.CSSProperties = { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '13px 4px', border: 'none', backgroundColor: 'transparent', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }
  const LBL: React.CSSProperties = { fontSize: 11, fontWeight: 600, fontFamily: 'Inter, sans-serif' }
  const CARD: React.CSSProperties = { backgroundColor: '#fff', borderRadius: 16, padding: '16px 18px', boxShadow: '0 1px 8px rgba(44,28,16,0.08)' }

  return (
    <div style={{ minHeight: '100dvh', backgroundColor: '#F2EBE0', fontFamily: 'Inter, sans-serif' }}>
      {toast && <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 999, backgroundColor: '#2C1810', color: '#fff', borderRadius: 14, padding: '10px 20px', fontSize: 13, fontWeight: 600, pointerEvents: 'none', boxShadow: '0 6px 24px rgba(0,0,0,0.28)' }}>{toast}</div>}

      {/* Header sticky */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: 'rgba(242,235,224,0.92)', backdropFilter: 'blur(10px)', padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => router.back()} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.8)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2D5A3D', fontSize: 18, flexShrink: 0, boxShadow: '0 1px 6px rgba(0,0,0,0.1)' }}>←</button>
        <p style={{ flex: 1, fontWeight: 700, fontSize: 15, color: '#2C1810', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{producer.nom}</p>
        {isAdmin && <button onClick={() => setEditing(true)} style={{ fontSize: 11, fontWeight: 700, color: '#2D5A3D', border: '1.5px solid #2D5A3D', borderRadius: 10, padding: '5px 12px', backgroundColor: 'transparent', cursor: 'pointer', flexShrink: 0 }}>✏️</button>}
      </div>

      {/* Photo avec texte superposé */}
      <div style={{ position: 'relative', height: 280, backgroundColor: '#C4D9C4', overflow: 'hidden' }}>
        {photos.length > 0
          ? <img src={photos[photoIdx]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><img src="/icons/producteur-local.png" alt="" style={{ width: 100, opacity: 0.3 }} /></div>}

        {/* Gradient sombre depuis le bas */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 18%, rgba(0,0,0,0.15) 48%, rgba(0,0,0,0.78) 100%)' }} />

        {/* Badge PRODUCTEUR LOCAL en haut */}
        <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 6 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, backgroundColor: '#2D5A3D', color: '#fff', borderRadius: 999, padding: '4px 11px', fontSize: 11, fontWeight: 800, letterSpacing: '0.04em' }}>🌿 PRODUCTEUR LOCAL</span>
          {producer.is_featured && <span style={{ backgroundColor: '#F5EFD6', color: '#8B6914', borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 700 }}>★ À la une</span>}
        </div>

        {/* Navigation photos */}
        {photos.length > 1 && <>
          <button onClick={() => setPhotoIdx(i => (i - 1 + photos.length) % photos.length)} style={{ position: 'absolute', left: 10, top: '45%', transform: 'translateY(-50%)', width: 30, height: 30, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.55)', border: 'none', color: '#2C1810', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
          <button onClick={() => setPhotoIdx(i => (i + 1) % photos.length)} style={{ position: 'absolute', right: 10, top: '45%', transform: 'translateY(-50%)', width: 30, height: 30, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.55)', border: 'none', color: '#2C1810', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
        </>}

        {/* Nom, commune, description sur la photo */}
        <div style={{ position: 'absolute', bottom: 50, left: 16, right: 16 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#fff', margin: '0 0 3px', lineHeight: 1.15, fontFamily: 'Inter, sans-serif' }}>{producer.nom}</h1>
          {producer.commune && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', margin: '0 0 6px', fontFamily: 'Inter, sans-serif' }}>📍 {producer.commune}</p>}
          {producer.description_courte && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', lineHeight: 1.45, margin: 0, fontFamily: 'Inter, sans-serif', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{producer.description_courte}</p>}
        </div>
      </div>

      {/* Bandeau flottant — 4 boutons uniquement */}
      <div style={{ position: 'relative', zIndex: 2, marginTop: -38, marginLeft: 12, marginRight: 12, borderRadius: 20, backgroundColor: '#fff', boxShadow: '0 2px 14px rgba(44,28,16,0.1)' }}>
        <div style={{ display: 'flex' }}>
          <button style={BTN} onClick={toggleFav}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill={isFav ? '#E8622A' : 'none'} stroke={isFav ? '#E8622A' : '#8A7A6A'} strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            <span style={{ ...LBL, color: isFav ? '#E8622A' : '#8A7A6A' }}>Favori</span>
          </button>
          {producer.user_id !== user?.id && (
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

      {/* Chips d'information */}
      <div style={{ display: 'flex', gap: 6, margin: '10px 12px 0' }}>
        {dispoPeriodLabel && <InfoChip label="Ouvert" sub={dispoPeriodLabel} />}
        {producer.vente_directe !== false && <InfoChip label="Vente directe" sub="Du producteur" />}
        {producer.retrait_sur_place !== false && <InfoChip label="À retirer" sub="Sur place / marché" />}
      </div>

      <div style={{ padding: '12px 12px 48px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* À propos */}
        {producer.description_longue && (
          <div style={{ ...CARD, position: 'relative', overflow: 'hidden' }}>
            <img src="/icons/a-propos.png" alt="" style={{ position: 'absolute', top: 10, right: 10, width: 58, opacity: 0.14, pointerEvents: 'none' }} />
            <h3 style={{ fontSize: 11, fontWeight: 800, color: '#8A7A6A', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>À propos</h3>
            <p style={{ fontSize: 14, color: '#4A3728', lineHeight: 1.7, margin: 0, fontFamily: 'Inter, sans-serif' }}>{producer.description_longue}</p>
          </div>
        )}

        {/* Contact */}
        {(producer.contact_tel || producer.contact_whatsapp || producer.site_web || mapsUrl) && (
          <div style={{ ...CARD, padding: '16px 18px' }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: '#8A7A6A', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Contact</p>
            {producer.contact_tel && (
              <a href={`tel:${producer.contact_tel}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', textDecoration: 'none', borderBottom: '1px solid #F0E8DC' }}>
                <span style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#E8F2EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>📞</span>
                <span style={{ flex: 1, fontSize: 14, color: '#2D5A3D', fontWeight: 600 }}>{producer.contact_tel}</span>
                <span style={{ color: '#C8B8A8', fontSize: 20 }}>›</span>
              </a>
            )}
            {producer.contact_whatsapp && (
              <a href={`https://wa.me/${producer.contact_whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', textDecoration: 'none', borderBottom: '1px solid #F0E8DC' }}>
                <span style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#E8F2EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>💬</span>
                <span style={{ flex: 1, fontSize: 14, color: '#2D5A3D', fontWeight: 600 }}>WhatsApp</span>
                <span style={{ color: '#C8B8A8', fontSize: 20 }}>›</span>
              </a>
            )}
            {producer.site_web && (
              <a href={producer.site_web.startsWith('http') ? producer.site_web : `https://${producer.site_web}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', textDecoration: 'none', borderBottom: mapsUrl ? '1px solid #F0E8DC' : 'none' }}>
                <span style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#E8F2EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>🔗</span>
                <span style={{ flex: 1, fontSize: 14, color: '#2D5A3D', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{producer.site_web.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
                <span style={{ color: '#C8B8A8', fontSize: 20 }}>›</span>
              </a>
            )}
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', textDecoration: 'none' }}>
                <span style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#E8F2EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>🗺️</span>
                <span style={{ flex: 1, fontSize: 14, color: '#2D5A3D', fontWeight: 600 }}>Voir l&apos;itinéraire</span>
                <span style={{ color: '#C8B8A8', fontSize: 20 }}>›</span>
              </a>
            )}
          </div>
        )}

        {/* Produits disponibles */}
        {products.length > 0 && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 8px rgba(44,28,16,0.08)' }}>
            <div style={{ padding: '16px 18px 12px' }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: '#8A7A6A', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Produits disponibles</p>
              <p style={{ fontSize: 12, color: '#AAA', margin: 0, fontFamily: 'Inter, sans-serif' }}>Mis à jour par le producteur</p>
            </div>
            {Object.entries(byCategory).map(([cat, prods]) => {
              const info = PRODUIT_CATS_MAP[cat]
              const icon = PRODUIT_CAT_ICONS[cat] ?? '/icons/autre.png'
              return (
                <div key={cat} style={{ borderTop: '1px solid #F0E8DC' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px 8px' }}>
                    <img src={icon} alt="" style={{ width: 34, height: 34, objectFit: 'contain', flexShrink: 0 }} />
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#2D5A3D' }}>{info?.label ?? cat}</span>
                  </div>
                  <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {prods.map(p => (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', backgroundColor: '#FAF7F2', borderRadius: 12 }}>
                        <span style={{ flex: 1, fontSize: 14, color: '#2C1810', fontWeight: 500 }}>{p.nom}</span>
                        {p.periode_dispo === 'semaine' && <span style={{ fontSize: 10, color: '#2D5A3D', backgroundColor: '#DFF0E3', borderRadius: 999, padding: '3px 9px', fontWeight: 700, flexShrink: 0 }}>Cette sem.</span>}
                        {p.periode_dispo === 'weekend' && <span style={{ fontSize: 10, color: '#C4622D', backgroundColor: '#FDE8DC', borderRadius: 999, padding: '3px 9px', fontWeight: 700, flexShrink: 0 }}>Ce weekend</span>}
                        {p.prix_indicatif && <span style={{ fontSize: 13, fontWeight: 700, color: '#5C3D1E', flexShrink: 0 }}>{p.prix_indicatif}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {products.length === 0 && (
          <div style={{ ...CARD, textAlign: 'center', padding: 28 }}>
            <p style={{ fontSize: 13, color: '#AAA', margin: 0 }}>Aucun produit disponible actuellement</p>
          </div>
        )}

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
              <button onClick={sendComment} disabled={!commentText.trim() || sendingComment}
                style={{ padding: '9px 16px', borderRadius: 12, border: 'none', backgroundColor: commentText.trim() && !sendingComment ? '#2D5A3D' : '#D8D0C8', color: '#fff', fontWeight: 700, fontSize: 13, cursor: commentText.trim() && !sendingComment ? 'pointer' : 'default', transition: 'background-color 0.15s' }}>→</button>
            </div>
          </div>
          {comments.length === 0 && <p style={{ fontSize: 13, color: '#AAA', textAlign: 'center', margin: 0 }}>Soyez le premier à donner votre avis !</p>}
          {comments.map(c => (
            <div key={c.id} style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <Avatar name={c.profile?.display_name || '?'} url={c.profile?.avatar_url} size={32} />
              <div style={{ flex: 1, backgroundColor: '#FAF7F2', borderRadius: 12, padding: '9px 13px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#2C1810' }}>{c.profile?.display_name ?? 'Anonyme'}</span>
                  <span style={{ fontSize: 11, color: '#AAA' }}>{timeAgo(c.created_at)}</span>
                  {c.user_id === user?.id && editingCommentId !== c.id && (
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
                      <button onClick={() => { setEditingCommentId(c.id); setEditCommentText(c.content) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', fontSize: 12, color: '#8A7A6A', borderRadius: 6 }}>✏️</button>
                      <button onClick={() => deleteComment(c.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', fontSize: 12, color: '#E8622A', borderRadius: 6 }}>🗑</button>
                    </div>
                  )}
                </div>
                {editingCommentId === c.id ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input value={editCommentText} onChange={e => setEditCommentText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveEditComment(c.id); if (e.key === 'Escape') setEditingCommentId(null) }}
                      autoFocus
                      style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1.5px solid #2D5A3D', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none', backgroundColor: '#fff' }} />
                    <button onClick={() => saveEditComment(c.id)} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', backgroundColor: '#2D5A3D', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>✓</button>
                    <button onClick={() => setEditingCommentId(null)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #DDD', backgroundColor: 'transparent', fontSize: 12, cursor: 'pointer' }}>✕</button>
                  </div>
                ) : (
                  <p style={{ fontSize: 13, color: '#4A3728', margin: 0, lineHeight: 1.55 }}>{c.content}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ background: 'linear-gradient(135deg, #2D5A3D 0%, #3A7050 100%)', borderRadius: 16, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 3px 12px rgba(45,90,61,0.2)' }}>
          <img src="/icons/producteur-local.png" alt="" style={{ width: 52, flexShrink: 0, filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.2))' }} />
          <div>
            <p style={{ fontSize: 13, fontWeight: 800, color: '#fff', margin: '0 0 4px' }}>Soutenez vos producteurs locaux</p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)', margin: 0, fontFamily: 'Inter, sans-serif', lineHeight: 1.45 }}>En achetant local, vous soutenez une agriculture durable et humaine.</p>
          </div>
        </div>

      </div>

      {editing && producer && <ProducerEditDrawer producer={producer} onClose={() => setEditing(false)} onSaved={updated => setProducer(updated)} />}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
