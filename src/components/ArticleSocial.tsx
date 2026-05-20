'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'

interface Comment {
  id: string
  user_id: string | null
  parent_id: string | null
  content: string
  created_at: string
  profile: { display_name: string | null; avatar_url: string | null } | null
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return 'à l\'instant'
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}j`
}

function Avatar({ name, url, size = 32 }: { name: string; url?: string | null; size?: number }) {
  if (url) return <img src={url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', backgroundColor: '#2D5A3D',
      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.38, flexShrink: 0,
    }}>{(name || '?')[0].toUpperCase()}</div>
  )
}

interface Props {
  articleId: string
}

export default function ArticleSocial({ articleId }: Props) {
  const { user } = useAuth()
  const { openAuthModal } = useAuthModal()
  const [likeCount, setLikeCount] = useState(0)
  const [liked, setLiked] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    const headers = await authHeaders()
    const [likeRes, commentsRes] = await Promise.all([
      fetch(`/api/articles/${articleId}/like`, { headers }),
      fetch(`/api/articles/${articleId}/comments`),
    ])
    if (likeRes.ok) {
      const d = await likeRes.json()
      setLikeCount(d.count ?? 0)
      setLiked(!!d.liked)
    }
    if (commentsRes.ok) {
      const d = await commentsRes.json()
      setComments(d.comments ?? [])
    }
    setLoading(false)
  }, [articleId])

  useEffect(() => { loadAll() }, [loadAll])

  const toggleLike = async () => {
    if (!user) { openAuthModal(); return }
    // Optimistic
    const wasLiked = liked
    setLiked(!wasLiked)
    setLikeCount(c => c + (wasLiked ? -1 : 1))
    const res = await fetch(`/api/articles/${articleId}/like`, {
      method: 'POST',
      headers: await authHeaders(),
    })
    if (!res.ok) {
      // Rollback
      setLiked(wasLiked)
      setLikeCount(c => c + (wasLiked ? 1 : -1))
    }
  }

  const submitComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) { openAuthModal(); return }
    const content = text.trim()
    if (!content) return
    setSending(true); setError(null)
    const res = await fetch(`/api/articles/${articleId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ content }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setError(d.error || 'Erreur'); setSending(false); return }
    setText('')
    setSending(false)
    loadAll()
  }

  const deleteComment = async (cid: string) => {
    if (!confirm('Supprimer ce commentaire ?')) return
    await fetch(`/api/articles/${articleId}/comments/${cid}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    })
    loadAll()
  }

  return (
    <div className="mt-6">
      {/* Like bar */}
      <div className="flex items-center gap-3 border-t border-bordSoft pt-4">
        <button
          type="button"
          onClick={toggleLike}
          className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-bold transition-colors"
          style={{
            borderColor: liked ? '#C84B2F' : '#E8E0D4',
            background: liked ? '#FFF0E5' : '#fff',
            color: liked ? '#C84B2F' : '#1A1209',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          {likeCount}
        </button>
        <span className="text-[12px] text-texte-doux">
          {comments.length === 0 ? 'Aucun commentaire' : `${comments.length} commentaire${comments.length > 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Formulaire de commentaire */}
      <form onSubmit={submitComment} className="mt-4">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={user ? 'Écrire un commentaire…' : 'Connecte-toi pour commenter'}
          disabled={!user || sending}
          rows={3}
          maxLength={2000}
          className="w-full rounded-[12px] border border-bord bg-white px-4 py-3 text-[14px] text-texte focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        {error && (
          <p className="mt-2 text-[12px] text-accent">{error}</p>
        )}
        <div className="mt-2 flex justify-end">
          <button
            type="submit"
            disabled={!user || sending || !text.trim()}
            className="rounded-[10px] bg-primary px-4 py-2 text-[12px] font-bold text-white disabled:opacity-50"
          >
            {sending ? 'Envoi…' : 'Publier'}
          </button>
        </div>
      </form>

      {/* Liste commentaires */}
      <div className="mt-5 space-y-3">
        {loading && <p className="text-[12px] text-texte-doux">Chargement…</p>}
        {!loading && comments.length === 0 && (
          <p className="text-[12px] text-texte-tres-doux text-center py-2">
            Soyez le premier à commenter.
          </p>
        )}
        {comments.map(c => {
          const isMine = !!user && c.user_id === user.id
          const name = c.profile?.display_name || 'Utilisateur'
          return (
            <div key={c.id} className="flex gap-3 rounded-[12px] border border-bordSoft bg-white p-3">
              {c.user_id ? (
                <Link href={`/profil/${c.user_id}`} aria-label={`Profil de ${name}`}>
                  <Avatar name={name} url={c.profile?.avatar_url} size={36} />
                </Link>
              ) : (
                <Avatar name={name} url={null} size={36} />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  {c.user_id ? (
                    <Link
                      href={`/profil/${c.user_id}`}
                      className="truncate text-[13px] font-bold text-texte hover:underline"
                    >
                      {name}
                    </Link>
                  ) : (
                    <span className="truncate text-[13px] font-bold text-texte">{name}</span>
                  )}
                  <span className="shrink-0 text-[10px] text-texte-doux">{timeAgo(c.created_at)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-[13px] leading-[1.5] text-texte">{c.content}</p>
                {isMine && (
                  <button
                    type="button"
                    onClick={() => deleteComment(c.id)}
                    className="mt-1.5 text-[10px] font-semibold text-accent"
                  >
                    Supprimer
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
