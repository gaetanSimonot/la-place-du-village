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
  photos: string[]; is_max: boolean; is_featured: boolean
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
  const [showComments, setShowComments] = useState(false)
  const [editing, setEditing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>()

  const showToast = useCallback((msg: string) => {
    clearTimeout(toastTimer.current); setToast(msg)
    toastTimer.current = setTimeout(() => setToast(null), 2000)
  }, [])

  useEffect(() => {
    fetch(`/api/producers/${id}`)
      .then(r => r.json())
      .then(d => { setProducer(d.producer ?? null); setProducts(d.products ?? []); setLoading(false) })
      .catch(() => setLoading(false))
    supabase.from('producer_comments').select('id', { count: 'exact', head: true }).eq('producer_id', id)
      .then(({ count }) => setCommentCount(count ?? 0))
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
  async function loadComments() {
    const { data: raw } = await supabase.from('producer_comments').select('id,user_id,content,parent_id,created_at').eq('producer_id', id).order('created_at', { ascending: true })
    if (!raw) return
    const uids = Array.from(new Set(raw.map((c: { user_id: string }) => c.user_id)))
    let pmap: Record<string, { id: string; display_name: string | null; avatar_url: string | null }> = {}
    if (uids.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('user_id,display_name,avatar_url').in('user_id', uids)
      pmap = Object.fromEntries(((profiles ?? []) as { user_id: string; display_name: string | null; avatar_url: string | null }[]).map(p => [p.user_id, { id: p.user_id, display_name: p.display_name, avatar_url: p.avatar_url }]))
    }
    const merged: Comment[] = raw.map((c: { id: string; user_id: string; content: string; parent_id: string | null; created_at: string }) => ({ ...c, profile: pmap[c.user_id] ?? null }))
    setComments(merged); setCommentCount(merged.length)
  }
  async function toggleComments() { if (!showComments) await loadComments(); setShowComments(v => !v) }
  async function sendComment() {
    if (!user) { openAuthModal(); return }
    if (!commentText.trim() || sendingComment) return
    setSendingComment(true)
    const { data, error } = await supabase.from('producer_comments').insert({ producer_id: id, user_id: user.id, content: commentText.trim(), parent_id: null }).select('id,user_id,content,parent_id,created_at').single()
    if (!error && data) {
      const c: Comment = { ...(data as { id: string; user_id: string; content: string; parent_id: string | null; created_at: string }), profile: { id: user.id, display_name: profile?.display_name ?? null, avatar_url: profile?.avatar_url ?? null } }
      setComments(prev => [...prev, c]); setCommentCount(n => n + 1); setCommentText('')
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
  const mapsUrl = producer.lat && producer.lng ? `https://www.google.com/maps/dir/?api=1&destination=${producer.lat},${producer.lng}` : producer.adresse ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(producer.adresse)}` : null
  const byCategory: Record<string, Product[]> = {}
  products.forEach(p => { const cat = normalizeProduitCat(p.categorie); if (!byCategory[cat]) byCategory[cat] = []; byCategory[cat].push(p) })
  const dispoPeriod = products.some(p => p.periode_dispo === 'semaine') ? { label: 'Cette semaine', bg: '#E8F2EB', color: '#2D5A3D' } : products.some(p => p.periode_dispo === 'weekend') ? { label: 'Ce weekend', bg: '#FFF3E0', color: '#C4622D' } : products.length > 0 ? { label: 'En vente', bg: '#E8F2EB', color: '#2D5A3D' } : null

  const BTN: React.CSSProperties = { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '12px 4px', border: 'none', backgroundColor: 'transparent', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }
  const LBL: React.CSSProperties = { fontSize: 11, fontWeight: 600, fontFamily: 'Inter, sans-serif' }

  return (
    <div style={{ minHeight: '100dvh', backgroundColor: '#F5F0E8', fontFamily: 'Inter, sans-serif' }}>
      {toast && <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 999, backgroundColor: '#2C1810', color: '#fff', borderRadius: 12, padding: '10px 18px', fontSize: 13, fontWeight: 600, pointerEvents: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}>{toast}</div>}

      {/* Header sticky */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(8px)', borderBottom: '1px solid #EDE8E0', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => router.back()} style={{ color: '#2D5A3D', fontWeight: 700, fontSize: 22, background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: '0 4px 0 0', flexShrink: 0 }}>←</button>
        <p style={{ flex: 1, fontWeight: 700, fontSize: 15, color: '#2C1810', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{producer.nom}</p>
        {producer.is_featured && <span style={{ fontSize: 9, backgroundColor: '#2D5A3D', color: '#fff', borderRadius: 999, padding: '3px 8px', fontWeight: 800, flexShrink: 0 }}>★ À la une</span>}
        {producer.is_max && <span style={{ fontSize: 9, backgroundColor: '#E8622A', color: '#fff', borderRadius: 999, padding: '3px 8px', fontWeight: 800, flexShrink: 0 }}>MAX</span>}
        {isAdmin && <button onClick={() => setEditing(true)} style={{ fontSize: 11, fontWeight: 700, color: '#2D5A3D', border: '1px solid #2D5A3D', borderRadius: 999, padding: '4px 12px', backgroundColor: 'transparent', cursor: 'pointer', flexShrink: 0 }}>✏️ Éditer</button>}
      </div>

      {/* Photo banner */}
      <div style={{ position: 'relative', height: 260, backgroundColor: '#C8DFC8', overflow: 'hidden' }}>
        {photos.length > 0
          ? <img src={photos[photoIdx]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#D4E8D4' }}><img src="/icons/producteur-local.png" alt="" style={{ width: 120, opacity: 0.5 }} /></div>}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.55) 70%, rgba(0,0,0,0.78) 100%)' }} />
        <img src="/icons/producteur-local.png" alt="" style={{ position: 'absolute', top: 12, right: 12, width: 72, filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.3))' }} />
        {photos.length > 1 && <>
          <button onClick={() => setPhotoIdx(i => (i - 1 + photos.length) % photos.length)} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 30, height: 30, borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.4)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
          <button onClick={() => setPhotoIdx(i => (i + 1) % photos.length)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 30, height: 30, borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.4)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
        </>}
        <div style={{ position: 'absolute', bottom: 16, left: 16, right: 90 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#fff', margin: '0 0 3px', fontFamily: 'Inter, sans-serif', textShadow: '0 2px 8px rgba(0,0,0,0.4)', lineHeight: 1.15 }}>{producer.nom}</h1>
          {producer.commune && <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.88)', margin: 0, fontFamily: 'Lora, serif' }}>📍 {producer.commune}</p>}
        </div>
      </div>

      {/* Action bar */}
      <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #EDE8E0', display: 'flex' }}>
        <button style={BTN} onClick={() => { toggleFav() }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill={isFav ? '#E8622A' : 'none'} stroke={isFav ? '#E8622A' : '#6B5E4E'} strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          <span style={{ ...LBL, color: isFav ? '#E8622A' : '#6B5E4E' }}>Favori</span>
        </button>
        <button style={BTN} onClick={() => { toggleFollow() }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={isFollowing ? '#2D5A3D' : '#6B5E4E'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {isFollowing ? <path d="M20 6L9 17l-5-5"/> : <><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/></>}
          </svg>
          <span style={{ ...LBL, color: isFollowing ? '#2D5A3D' : '#6B5E4E' }}>{isFollowing ? 'Suivi' : 'Suivre'}</span>
        </button>
        <button style={BTN} onClick={() => { toggleComments() }}>
          <div style={{ position: 'relative' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={showComments ? '#2D5A3D' : '#6B5E4E'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            {commentCount > 0 && <span style={{ position: 'absolute', top: -5, right: -7, backgroundColor: '#2D5A3D', color: '#fff', borderRadius: 999, fontSize: 9, fontWeight: 700, padding: '0 4px', minWidth: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{commentCount}</span>}
          </div>
          <span style={{ ...LBL, color: showComments ? '#2D5A3D' : '#6B5E4E' }}>Avis</span>
        </button>
        <button style={BTN} onClick={share}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6B5E4E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          <span style={LBL}>Partager</span>
        </button>
      </div>

      {/* Info strip */}
      {(dispoPeriod || mapsUrl) && (
        <div style={{ display: 'flex', backgroundColor: '#fff', borderBottom: '1px solid #EDE8E0' }}>
          {dispoPeriod && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 6px', borderRight: '1px solid #EDE8E0' }}>
              <span style={{ fontSize: 16, marginBottom: 3 }}>🗓</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: dispoPeriod.color, fontFamily: 'Inter, sans-serif', textAlign: 'center' }}>{dispoPeriod.label}</span>
            </div>
          )}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 6px', borderRight: mapsUrl ? '1px solid #EDE8E0' : 'none' }}>
            <span style={{ fontSize: 16, marginBottom: 3 }}>🌿</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#2D5A3D', fontFamily: 'Inter, sans-serif', textAlign: 'center' }}>Vente directe</span>
          </div>
          {mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 6px', textDecoration: 'none' }}>
              <span style={{ fontSize: 16, marginBottom: 3 }}>📍</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#6B5E4E', fontFamily: 'Inter, sans-serif', textAlign: 'center' }}>Itinéraire</span>
            </a>
          )}
        </div>
      )}

      <div style={{ padding: '14px 14px 40px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* À propos */}
        {(producer.description_courte || producer.description_longue) && (
          <div style={{ backgroundColor: '#fff', borderRadius: 18, padding: 16, boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <img src="/icons/a-propos.png" alt="" style={{ width: 38, height: 38, objectFit: 'contain' }} />
              <h2 style={{ fontSize: 16, fontWeight: 800, color: '#2C1810', margin: 0 }}>À propos</h2>
            </div>
            {producer.description_courte && <p style={{ fontSize: 14, color: '#4A3728', lineHeight: 1.65, margin: '0 0 8px', fontFamily: 'Lora, serif', fontWeight: 500 }}>{producer.description_courte}</p>}
            {producer.description_longue && <p style={{ fontSize: 14, color: '#6B5E4E', lineHeight: 1.7, margin: 0, fontFamily: 'Lora, serif' }}>{producer.description_longue}</p>}
          </div>
        )}

        {/* Contact */}
        {(producer.contact_tel || producer.contact_whatsapp || producer.site_web || mapsUrl) && (
          <div style={{ backgroundColor: '#fff', borderRadius: 18, padding: '14px 16px', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: '#2C1810', margin: '0 0 12px' }}>Contact</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {producer.contact_tel && (
                <a href={`tel:${producer.contact_tel}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', textDecoration: 'none', borderBottom: '1px solid #F2EDE6' }}>
                  <span style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#E8F2EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>📞</span>
                  <span style={{ flex: 1, fontSize: 14, color: '#2D5A3D', fontWeight: 600 }}>{producer.contact_tel}</span>
                  <span style={{ color: '#C0B8A8', fontSize: 18 }}>›</span>
                </a>
              )}
              {producer.contact_whatsapp && (
                <a href={`https://wa.me/${producer.contact_whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', textDecoration: 'none', borderBottom: '1px solid #F2EDE6' }}>
                  <span style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#E8F2EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>💬</span>
                  <span style={{ flex: 1, fontSize: 14, color: '#2D5A3D', fontWeight: 600 }}>WhatsApp</span>
                  <span style={{ color: '#C0B8A8', fontSize: 18 }}>›</span>
                </a>
              )}
              {producer.site_web && (
                <a href={producer.site_web.startsWith('http') ? producer.site_web : `https://${producer.site_web}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', textDecoration: 'none', borderBottom: mapsUrl ? '1px solid #F2EDE6' : 'none' }}>
                  <span style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#E8F2EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>🔗</span>
                  <span style={{ flex: 1, fontSize: 14, color: '#2D5A3D', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{producer.site_web.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
                  <span style={{ color: '#C0B8A8', fontSize: 18 }}>›</span>
                </a>
              )}
              {mapsUrl && (
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', textDecoration: 'none' }}>
                  <span style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#E8F2EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>🗺️</span>
                  <span style={{ flex: 1, fontSize: 14, color: '#2D5A3D', fontWeight: 600 }}>Voir l&apos;itinéraire</span>
                  <span style={{ color: '#C0B8A8', fontSize: 18 }}>›</span>
                </a>
              )}
            </div>
          </div>
        )}

        {/* Produits disponibles */}
        {products.length > 0 && (
          <div style={{ backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
            <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #F2EDE6' }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: '#2C1810', margin: '0 0 2px' }}>Produits disponibles</h3>
              <p style={{ fontSize: 12, color: '#9B8E82', margin: 0, fontFamily: 'Lora, serif' }}>Mis à jour par le producteur</p>
            </div>
            {Object.entries(byCategory).map(([cat, prods], catIdx) => {
              const info = PRODUIT_CATS_MAP[cat]
              const icon = PRODUIT_CAT_ICONS[cat] ?? '/icons/autre.png'
              return (
                <div key={cat}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px 8px', backgroundColor: catIdx % 2 === 0 ? '#FAFAF8' : '#fff', borderTop: catIdx > 0 ? '1px solid #F2EDE6' : 'none' }}>
                    <img src={icon} alt="" style={{ width: 34, height: 34, objectFit: 'contain', flexShrink: 0 }} />
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#2D5A3D' }}>{info?.label ?? cat}</span>
                  </div>
                  <div style={{ padding: '0 16px 10px', display: 'flex', flexDirection: 'column', gap: 6, backgroundColor: catIdx % 2 === 0 ? '#FAFAF8' : '#fff' }}>
                    {prods.map(p => (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', backgroundColor: '#fff', borderRadius: 10, border: '1px solid #EDE8E0' }}>
                        <span style={{ flex: 1, fontSize: 14, color: '#2C1810', fontWeight: 500 }}>{p.nom}</span>
                        {p.periode_dispo === 'semaine' && <span style={{ fontSize: 10, color: '#2D5A3D', backgroundColor: '#E8F2EB', borderRadius: 999, padding: '2px 8px', fontWeight: 700, flexShrink: 0 }}>Cette sem.</span>}
                        {p.periode_dispo === 'weekend' && <span style={{ fontSize: 10, color: '#C4622D', backgroundColor: '#FFF3E0', borderRadius: 999, padding: '2px 8px', fontWeight: 700, flexShrink: 0 }}>Ce weekend</span>}
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
          <div style={{ backgroundColor: '#fff', borderRadius: 18, padding: 24, textAlign: 'center', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
            <p style={{ fontSize: 13, color: '#8A8A8A', margin: 0 }}>Aucun produit disponible actuellement</p>
          </div>
        )}

        {/* Commentaires */}
        {showComments && (
          <div style={{ backgroundColor: '#fff', borderRadius: 18, padding: 16, boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
            <h3 style={{ fontWeight: 800, fontSize: 15, color: '#2C1810', margin: '0 0 14px' }}>Avis {commentCount > 0 && `(${commentCount})`}</h3>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <Avatar name={profile?.display_name || user?.email || '?'} url={profile?.avatar_url} size={34} />
              <div style={{ flex: 1, display: 'flex', gap: 8 }}>
                <input value={commentText} onChange={e => setCommentText(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendComment()}
                  placeholder={user ? 'Votre avis…' : 'Connectez-vous pour commenter'}
                  style={{ flex: 1, padding: '8px 12px', borderRadius: 10, border: '1.5px solid #E8E0D5', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none', color: '#2C1810' }}
                  onClick={() => { if (!user) openAuthModal() }} />
                <button onClick={sendComment} disabled={!commentText.trim() || sendingComment}
                  style={{ padding: '8px 14px', borderRadius: 10, border: 'none', backgroundColor: commentText.trim() && !sendingComment ? '#2D5A3D' : '#CCC', color: '#fff', fontWeight: 700, fontSize: 13, cursor: commentText.trim() && !sendingComment ? 'pointer' : 'default' }}>→</button>
              </div>
            </div>
            {comments.length === 0 && <p style={{ fontSize: 13, color: '#8A8A8A', textAlign: 'center', margin: 0 }}>Soyez le premier à donner votre avis !</p>}
            {comments.map(c => (
              <div key={c.id} style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <Avatar name={c.profile?.display_name || '?'} url={c.profile?.avatar_url} size={32} />
                <div style={{ flex: 1, backgroundColor: '#F8F7F4', borderRadius: 10, padding: '8px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#2C1810' }}>{c.profile?.display_name ?? 'Anonyme'}</span>
                    <span style={{ fontSize: 11, color: '#8A8A8A' }}>{timeAgo(c.created_at)}</span>
                  </div>
                  <p style={{ fontSize: 13, color: '#4A3728', margin: 0, lineHeight: 1.5 }}>{c.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ backgroundColor: '#2D5A3D', borderRadius: 18, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 1px 6px rgba(0,0,0,0.08)' }}>
          <img src="/icons/producteur-local.png" alt="" style={{ width: 52, flexShrink: 0 }} />
          <div>
            <p style={{ fontSize: 13, fontWeight: 800, color: '#fff', margin: '0 0 3px', fontFamily: 'Inter, sans-serif' }}>Soutenez vos producteurs locaux</p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', margin: 0, fontFamily: 'Lora, serif', lineHeight: 1.4 }}>En achetant local, vous soutenez une agriculture durable et humaine.</p>
          </div>
        </div>

      </div>

      {editing && producer && <ProducerEditDrawer producer={producer} onClose={() => setEditing(false)} onSaved={updated => setProducer(updated)} />}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
