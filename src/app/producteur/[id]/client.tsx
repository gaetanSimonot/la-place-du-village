'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import { PRODUIT_CATS_MAP } from '@/lib/produit-cats'

const FAV_KEY = 'pdv-producer-favoris'
const FOLLOW_KEY = 'pdv-producer-follows'

interface Producer {
  id: string; nom: string; description_courte: string | null; description_longue: string | null
  commune: string | null; adresse: string | null; lat: number | null; lng: number | null
  contact_tel: string | null; contact_whatsapp: string | null; site_web: string | null
  photos: string[]; is_max: boolean
}
interface Product {
  id: string; nom: string; categorie: string; prix_indicatif: string | null; periode_dispo: string | null
}

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return 'à l\'instant'
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}j`
}

interface Comment {
  id: string; user_id: string; content: string; parent_id: string | null; created_at: string
  profile: { id: string; display_name: string | null; avatar_url: string | null } | null
}

function Avatar({ name, url, size = 32 }: { name: string; url?: string | null; size?: number }) {
  if (url) return <img src={url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', backgroundColor: '#2D5A3D', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.38, flexShrink: 0 }}>
      {(name || '?')[0].toUpperCase()}
    </div>
  )
}

export default function ProducteurPageClient({ id }: { id: string }) {
  const { user, profile } = useAuth()
  const { openAuthModal } = useAuthModal()
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

  useEffect(() => {
    fetch(`/api/producers/${id}`)
      .then(r => r.json())
      .then(d => {
        setProducer(d.producer ?? null)
        setProducts(d.products ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))

    // Favorites + follows from localStorage
    try {
      const favs = JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]') as string[]
      setIsFav(favs.includes(id))
      const follows = JSON.parse(localStorage.getItem(FOLLOW_KEY) ?? '[]') as string[]
      setIsFollowing(follows.includes(id))
    } catch {}

    // Comments count
    supabase.from('producer_comments').select('id', { count: 'exact', head: true }).eq('producer_id', id)
      .then(({ count }) => setCommentCount(count ?? 0))
  }, [id])

  function toggleFav() {
    try {
      const favs = JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]') as string[]
      const next = favs.includes(id) ? favs.filter(x => x !== id) : [...favs, id]
      localStorage.setItem(FAV_KEY, JSON.stringify(next))
      setIsFav(next.includes(id))
    } catch {}
  }

  function toggleFollow() {
    if (!user) { openAuthModal(); return }
    try {
      const follows = JSON.parse(localStorage.getItem(FOLLOW_KEY) ?? '[]') as string[]
      const next = follows.includes(id) ? follows.filter(x => x !== id) : [...follows, id]
      localStorage.setItem(FOLLOW_KEY, JSON.stringify(next))
      setIsFollowing(next.includes(id))
    } catch {}
  }

  async function loadComments() {
    const { data: raw } = await supabase
      .from('producer_comments')
      .select('id, user_id, content, parent_id, created_at')
      .eq('producer_id', id)
      .order('created_at', { ascending: true })
    if (!raw) return
    const uids = Array.from(new Set(raw.map((c: { user_id: string }) => c.user_id)))
    let pmap: Record<string, { id: string; display_name: string | null; avatar_url: string | null }> = {}
    if (uids.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('user_id, display_name, avatar_url').in('user_id', uids)
      pmap = Object.fromEntries(((profiles ?? []) as { user_id: string; display_name: string | null; avatar_url: string | null }[]).map(p => [p.user_id, { id: p.user_id, display_name: p.display_name, avatar_url: p.avatar_url }]))
    }
    const merged: Comment[] = raw.map((c: { id: string; user_id: string; content: string; parent_id: string | null; created_at: string }) => ({ ...c, profile: pmap[c.user_id] ?? null }))
    setComments(merged)
    setCommentCount(merged.length)
  }

  async function toggleComments() {
    if (!showComments) { await loadComments() }
    setShowComments(v => !v)
  }

  async function sendComment() {
    if (!user) { openAuthModal(); return }
    if (!commentText.trim() || sendingComment) return
    setSendingComment(true)
    const { data, error } = await supabase
      .from('producer_comments')
      .insert({ producer_id: id, user_id: user.id, content: commentText.trim(), parent_id: null })
      .select('id, user_id, content, parent_id, created_at').single()
    if (!error && data) {
      const c: Comment = {
        ...(data as { id: string; user_id: string; content: string; parent_id: string | null; created_at: string }),
        profile: { id: user.id, display_name: profile?.display_name ?? null, avatar_url: profile?.avatar_url ?? null },
      }
      setComments(prev => [...prev, c])
      setCommentCount(n => n + 1)
      setCommentText('')
    }
    setSendingComment(false)
  }

  function share() {
    const url = window.location.href
    if (navigator.share) navigator.share({ title: producer?.nom ?? '', url }).catch(() => {})
    else navigator.clipboard.writeText(url).catch(() => {})
  }

  if (loading) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FBF7F0' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '4px solid #E0D8CE', borderTopColor: '#2D5A3D', animation: 'spin 0.7s linear infinite' }} />
    </div>
  )

  if (!producer) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FBF7F0' }}>
      <p style={{ color: '#8A8A8A', fontFamily: 'Inter, sans-serif' }}>Producteur introuvable</p>
    </div>
  )

  const photos = producer.photos ?? []
  const mapsUrl = producer.lat && producer.lng
    ? `https://www.google.com/maps/dir/?api=1&destination=${producer.lat},${producer.lng}`
    : producer.adresse
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(producer.adresse)}`
    : null

  // Group products by category
  const byCategory: Record<string, Product[]> = {}
  products.forEach(p => {
    if (!byCategory[p.categorie]) byCategory[p.categorie] = []
    byCategory[p.categorie].push(p)
  })

  const BTN: React.CSSProperties = {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 4, padding: '10px 4px', border: 'none', backgroundColor: 'transparent', cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  }
  const LBL: React.CSSProperties = { fontSize: 11, fontWeight: 600, fontFamily: 'Inter, sans-serif' }

  return (
    <div style={{ minHeight: '100dvh', backgroundColor: '#FBF7F0', fontFamily: 'Inter, sans-serif' }}>
      {/* Header sticky */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#fff', borderBottom: '1px solid #E8E0D5', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/" style={{ color: '#2D5A3D', fontWeight: 700, fontSize: 22, textDecoration: 'none', lineHeight: 1 }}>←</Link>
        <h1 style={{ fontWeight: 700, fontSize: 16, color: '#2C1810', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
          {producer.nom}
        </h1>
        {producer.is_max && (
          <span style={{ fontSize: 10, backgroundColor: '#E8622A', color: '#fff', borderRadius: 999, padding: '3px 8px', fontWeight: 800 }}>MAX</span>
        )}
      </div>

      {/* Photos */}
      {photos.length > 0 && (
        <div style={{ position: 'relative', height: 240, overflow: 'hidden', backgroundColor: '#E8F2EB' }}>
          <img src={photos[photoIdx]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          {photos.length > 1 && (
            <>
              <button onClick={() => setPhotoIdx(i => (i - 1 + photos.length) % photos.length)}
                style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 32, height: 32, borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.45)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 16 }}>‹</button>
              <button onClick={() => setPhotoIdx(i => (i + 1) % photos.length)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 32, height: 32, borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.45)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 16 }}>›</button>
              <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 5 }}>
                {photos.map((_, i) => (
                  <button key={i} onClick={() => setPhotoIdx(i)} style={{ width: i === photoIdx ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === photoIdx ? '#fff' : 'rgba(255,255,255,0.5)', border: 'none', cursor: 'pointer', padding: 0, transition: 'width 0.2s' }} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
      {photos.length === 0 && (
        <div style={{ height: 160, backgroundColor: '#E8F2EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64 }}>🌿</div>
      )}

      {/* Barre d'actions */}
      <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #F0EDE8', display: 'flex' }}>
        <button style={BTN} onClick={toggleFav}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill={isFav ? '#E8622A' : 'none'} stroke={isFav ? '#E8622A' : '#6B5E4E'} strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          <span style={{ ...LBL, color: isFav ? '#E8622A' : '#6B5E4E' }}>Favori</span>
        </button>
        <button style={BTN} onClick={toggleFollow}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={isFollowing ? '#2D5A3D' : '#6B5E4E'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8a6 6 0 0 1-12 0"/>
            <path d="M12 2v6M12 22v-6M4.93 10.93l4.24 4.24M14.83 14.83l4.24-4.24"/>
          </svg>
          <span style={{ ...LBL, color: isFollowing ? '#2D5A3D' : '#6B5E4E' }}>{isFollowing ? 'Suivi' : 'Suivre'}</span>
        </button>
        <button style={BTN} onClick={toggleComments}>
          <div style={{ position: 'relative' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6B5E4E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            {commentCount > 0 && (
              <span style={{ position: 'absolute', top: -5, right: -7, backgroundColor: '#2D5A3D', color: '#fff', borderRadius: 999, fontSize: 9, fontWeight: 700, padding: '0 4px', minWidth: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{commentCount}</span>
            )}
          </div>
          <span style={LBL}>Commentaires</span>
        </button>
        <button style={BTN} onClick={share}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6B5E4E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
          <span style={LBL}>Partager</span>
        </button>
      </div>

      {/* Contenu */}
      <div style={{ padding: '16px 16px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Infos principales */}
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16 }}>
          <h2 style={{ fontWeight: 700, fontSize: 22, color: '#2C1810', margin: '0 0 4px' }}>{producer.nom}</h2>
          {producer.commune && (
            <p style={{ fontSize: 13, color: '#6B5E4E', margin: '0 0 10px' }}>📍 {producer.commune}</p>
          )}
          {producer.description_courte && (
            <p style={{ fontSize: 14, color: '#4A3728', lineHeight: 1.6, margin: '0 0 10px', fontWeight: 500 }}>{producer.description_courte}</p>
          )}
          {producer.description_longue && (
            <p style={{ fontSize: 14, color: '#6B5E4E', lineHeight: 1.7, margin: 0 }}>{producer.description_longue}</p>
          )}
        </div>

        {/* Contacts */}
        {(producer.contact_tel || producer.contact_whatsapp || producer.site_web || mapsUrl) && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h3 style={{ fontWeight: 700, fontSize: 14, color: '#2C1810', margin: '0 0 4px' }}>Contact</h3>
            {producer.contact_tel && (
              <a href={`tel:${producer.contact_tel}`} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
                <span style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#E8F2EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📞</span>
                <span style={{ fontSize: 14, color: '#2D5A3D', fontWeight: 600 }}>{producer.contact_tel}</span>
              </a>
            )}
            {producer.contact_whatsapp && (
              <a href={`https://wa.me/${producer.contact_whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
                <span style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#E8F2EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>💬</span>
                <span style={{ fontSize: 14, color: '#2D5A3D', fontWeight: 600 }}>WhatsApp</span>
              </a>
            )}
            {producer.site_web && (
              <a href={producer.site_web.startsWith('http') ? producer.site_web : `https://${producer.site_web}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
                <span style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#E8F2EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🔗</span>
                <span style={{ fontSize: 14, color: '#2D5A3D', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{producer.site_web.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
              </a>
            )}
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
                <span style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#E8F2EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🗺️</span>
                <span style={{ fontSize: 14, color: '#2D5A3D', fontWeight: 600 }}>Itinéraire</span>
              </a>
            )}
          </div>
        )}

        {/* Produits disponibles */}
        {products.length > 0 && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16 }}>
            <h3 style={{ fontWeight: 700, fontSize: 16, color: '#2C1810', margin: '0 0 14px' }}>Produits disponibles</h3>
            {Object.entries(byCategory).map(([cat, prods]) => {
              const c = PRODUIT_CATS_MAP[cat]
              return (
                <div key={cat} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: 16 }}>{c?.emoji ?? '✦'}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#2D5A3D' }}>{c?.label ?? cat}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {prods.map(p => (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', backgroundColor: '#F8F7F4', borderRadius: 10 }}>
                        <span style={{ fontSize: 14, color: '#2C1810', fontWeight: 500 }}>{p.nom}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {p.periode_dispo === 'semaine' && <span style={{ fontSize: 10, color: '#2D5A3D', backgroundColor: '#E8F2EB', borderRadius: 999, padding: '2px 7px', fontWeight: 700 }}>Cette semaine</span>}
                          {p.periode_dispo === 'weekend' && <span style={{ fontSize: 10, color: '#2D5A3D', backgroundColor: '#E8F2EB', borderRadius: 999, padding: '2px 7px', fontWeight: 700 }}>Ce weekend</span>}
                          {p.prix_indicatif && <span style={{ fontSize: 13, fontWeight: 700, color: '#6B5E4E' }}>{p.prix_indicatif}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {products.length === 0 && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: '#8A8A8A', margin: 0 }}>Aucun produit disponible actuellement</p>
          </div>
        )}

        {/* Commentaires */}
        {showComments && (
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16 }}>
            <h3 style={{ fontWeight: 700, fontSize: 15, color: '#2C1810', margin: '0 0 14px' }}>
              Commentaires {commentCount > 0 && `(${commentCount})`}
            </h3>

            {/* Saisie */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <Avatar name={profile?.display_name || user?.email || '?'} url={profile?.avatar_url} size={34} />
              <div style={{ flex: 1, display: 'flex', gap: 8 }}>
                <input
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendComment()}
                  placeholder={user ? 'Votre commentaire…' : 'Connectez-vous pour commenter'}
                  style={{ flex: 1, padding: '8px 12px', borderRadius: 10, border: '1.5px solid #E8E0D5', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none', color: '#2C1810' }}
                  onClick={() => { if (!user) openAuthModal() }}
                />
                <button onClick={sendComment} disabled={!commentText.trim() || sendingComment}
                  style={{ padding: '8px 14px', borderRadius: 10, border: 'none', backgroundColor: commentText.trim() && !sendingComment ? '#2D5A3D' : '#CCC', color: '#fff', fontWeight: 700, fontSize: 13, cursor: commentText.trim() && !sendingComment ? 'pointer' : 'default' }}>
                  →
                </button>
              </div>
            </div>

            {/* Liste */}
            {comments.length === 0 && <p style={{ fontSize: 13, color: '#8A8A8A', textAlign: 'center', margin: 0 }}>Soyez le premier à commenter !</p>}
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
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}
