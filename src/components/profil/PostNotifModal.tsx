'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ClientPortal from '@/components/ClientPortal'
import { PostEmbedRender } from '@/components/profil/PostCard'
import PostMedia from '@/components/profil/PostMedia'
import type { MediaItem } from '@/lib/postMedia'

const T = {
  primary: '#2D5A3D',
  accent:  '#C84B2F',
  texte:   '#1A1209',
  texteDoux: '#7A6A5A',
  bordSoft: '#F0EAE0',
  white:   '#FFFFFF',
}

interface PostRow {
  id: string; user_id: string; texte: string
  embed_kind: string | null; embed_ref_id: string | null
  media: MediaItem[] | null; created_at: string
}

interface Props {
  postId:  string
  onClose: () => void
}

/**
 * Pop-up « communiqué » affichant un post de broadcast admin — emballage de
 * marque (illustration village multiply, DM Serif, trait orange, Caveat),
 * dans l'esprit du WelcomeModal. Lecture directe Supabase (pas de cache).
 */
export default function PostNotifModal({ postId, onClose }: Props) {
  const router = useRouter()
  const [post, setPost] = useState<PostRow | null>(null)
  const [author, setAuthor] = useState<{ name: string | null; avatar: string | null }>({ name: null, avatar: null })
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 40)
    return () => clearTimeout(t)
  }, [])

  const dismiss = () => { setVisible(false); setTimeout(onClose, 220) }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('posts')
        .select('id, user_id, texte, embed_kind, embed_ref_id, media, created_at')
        .eq('id', postId)
        .maybeSingle()
      if (cancelled) return
      if (!data) { setNotFound(true); setLoading(false); return }
      const p = data as PostRow
      setPost(p)
      const { data: prof } = await supabase
        .from('profiles').select('display_name, avatar_url').eq('user_id', p.user_id).maybeSingle()
      if (cancelled) return
      const pr = prof as { display_name: string | null; avatar_url: string | null } | null
      setAuthor({ name: pr?.display_name ?? null, avatar: pr?.avatar_url ?? null })
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [postId])

  const goToWall = () => {
    if (post) router.push(`/profil/${post.user_id}`)
    dismiss()
  }

  const initial = (author.name ?? '·').trim().charAt(0).toUpperCase() || '·'

  return (
    <ClientPortal>
      <div
        onClick={dismiss}
        style={{
          position: 'fixed', inset: 0, zIndex: 3600,
          background: visible ? 'rgba(26,18,9,0.55)' : 'rgba(26,18,9,0)',
          backdropFilter: visible ? 'blur(4px)' : 'none',
          transition: 'background-color 0.22s, backdrop-filter 0.22s',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16, fontFamily: 'var(--font-body), sans-serif',
        }}
        role="dialog"
        aria-modal="true"
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'relative', width: '100%', maxWidth: 420, maxHeight: '88%',
            background: T.white, borderRadius: 22, overflow: 'hidden',
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            display: 'flex', flexDirection: 'column',
            transform: visible ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.96)',
            opacity: visible ? 1 : 0,
            transition: 'transform 0.3s cubic-bezier(0.32,0.72,0,1), opacity 0.22s',
          }}
        >
          {/* Fermer */}
          <button
            onClick={dismiss}
            aria-label="Fermer"
            style={{
              position: 'absolute', top: 12, right: 12, zIndex: 10,
              background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(6px)',
              border: `1px solid ${T.bordSoft}`, width: 30, height: 30, borderRadius: 999,
              cursor: 'pointer', color: T.texteDoux, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          {/* ── Bandeau de marque ── */}
          <div style={{
            background: 'linear-gradient(135deg, #FBF3E6 0%, #F8EDD8 100%)',
            padding: '22px 22px 16px', position: 'relative', overflow: 'hidden',
          }}>
            <span style={{
              display: 'block', width: 'fit-content', margin: '0 auto 2px',
              padding: '4px 11px', borderRadius: 999, background: '#FFF0E5', color: T.accent,
              fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>
              📣 Annonce du village
            </span>
            <img
              src="/village-illustration.png" alt=""
              style={{ display: 'block', width: '44%', height: 'auto', margin: '6px auto 0', mixBlendMode: 'multiply', userSelect: 'none' }}
            />
            <h1 style={{
              margin: '6px 0 0', textAlign: 'center',
              fontFamily: 'var(--font-display), Georgia, serif',
              fontSize: 23, color: T.texte, letterSpacing: '-0.015em', lineHeight: 1.05,
            }}>
              Un mot <span style={{ color: T.accent, fontStyle: 'italic' }}>pour vous</span>
            </h1>
            <div style={{ width: 42, height: 3, borderRadius: 999, backgroundColor: T.accent, margin: '11px auto 4px' }} />
            <p style={{
              margin: 0, textAlign: 'center',
              fontFamily: 'var(--font-hand), Caveat, cursive', fontWeight: 700,
              fontSize: 17, color: T.primary, lineHeight: 1,
            }}>
              La Place du Village
            </p>
          </div>

          {/* ── Contenu du post ── */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px 4px' }}>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
                <div style={{ width: 26, height: 26, borderRadius: 999, border: `4px solid ${T.bordSoft}`, borderTopColor: T.primary, animation: 'spin 0.8s linear infinite' }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
              </div>
            ) : notFound || !post ? (
              <p style={{ padding: '24px 0', textAlign: 'center', fontSize: 13, color: T.texteDoux }}>Cette publication n&apos;existe plus.</p>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  {author.avatar ? (
                    <img src={author.avatar} alt="" style={{ width: 38, height: 38, borderRadius: 999, objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 38, height: 38, borderRadius: 999, background: T.primary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'var(--font-display), Georgia, serif', fontSize: 15 }}>{initial}</div>
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: T.texte, letterSpacing: '-0.005em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {author.name ?? 'La Place du Village'}
                    </div>
                    <div style={{ fontSize: 11, color: T.texteDoux }}>{formatDate(post.created_at)}</div>
                  </div>
                </div>

                {post.texte && (
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 14.5, lineHeight: 1.6, color: T.texte }}>
                    {post.texte}
                  </p>
                )}

                {post.media && post.media.length > 0 && (
                  <div style={{ marginTop: post.texte ? 14 : 0 }}>
                    <PostMedia media={post.media} />
                  </div>
                )}

                {post.embed_kind && post.embed_ref_id && (
                  <div style={{ marginTop: 14 }}>
                    <PostEmbedRender kind={post.embed_kind} refId={post.embed_ref_id} variant="large" />
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── CTA vers le mur ── */}
          {!loading && post && (
            <div style={{ padding: '14px 22px 20px', borderTop: `1px solid ${T.bordSoft}`, background: T.white }}>
              <button
                onClick={goToWall}
                style={{
                  width: '100%', padding: 14, borderRadius: 14, border: 'none', cursor: 'pointer',
                  background: T.primary, color: '#fff', fontSize: 14, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: '0 3px 12px rgba(45,90,61,0.25)', fontFamily: 'var(--font-body), sans-serif',
                }}
              >
                Aller vers le mur
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" /><polyline points="13 6 19 12 13 18" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </ClientPortal>
  )
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    const diffMins = (Date.now() - d.getTime()) / 60000
    if (diffMins < 1) return 'à l\'instant'
    if (diffMins < 60) return `il y a ${Math.floor(diffMins)} min`
    if (diffMins < 60 * 24) return `il y a ${Math.floor(diffMins / 60)} h`
    const diffD = diffMins / (60 * 24)
    if (diffD < 7) return `il y a ${Math.floor(diffD)} j`
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  } catch {
    return ''
  }
}
