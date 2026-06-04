'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import ClientPortal from '@/components/ClientPortal'

interface Props {
  postId:        string
  postAuthorId:  string
  onClose:       () => void
  onCountChange?: (count: number) => void
}

interface Comment {
  id:         string
  user_id:    string
  texte:      string
  created_at: string
  /* joint pour l'affichage */
  author_name:   string | null
  author_avatar: string | null
}

const MAX = 1000

export default function PostCommentsDrawer({ postId, postAuthorId, onClose, onCountChange }: Props) {
  const { user, profile } = useAuth()
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading]   = useState(true)
  const [texte, setTexte]       = useState('')
  const [sending, setSending]   = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Stabilise onCountChange via ref pour éviter une boucle infinie
  // (la prop est recréée inline à chaque render parent → recréerait
  // loadComments → relancerait useEffect → re-render parent → loop).
  const onCountChangeRef = useRef(onCountChange)
  useEffect(() => { onCountChangeRef.current = onCountChange }, [onCountChange])

  const loadComments = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('post_comments')
      .select('id, user_id, texte, created_at')
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
      .limit(500)
    if (error) {
      toast.error('Impossible de charger les commentaires')
      setLoading(false)
      return
    }
    const rows = (data ?? []) as Array<{ id: string; user_id: string; texte: string; created_at: string }>
    if (rows.length === 0) {
      setComments([])
      onCountChangeRef.current?.(0)
      setLoading(false)
      return
    }
    // Joint les profils auteurs en une requête séparée
    const userIds = Array.from(new Set(rows.map(r => r.user_id)))
    const { data: profs } = await supabase
      .from('profiles')
      .select('user_id, display_name, avatar_url')
      .in('user_id', userIds)
    const profMap = new Map<string, { display_name: string | null; avatar_url: string | null }>()
    for (const p of (profs ?? []) as Array<{ user_id: string; display_name: string | null; avatar_url: string | null }>) {
      profMap.set(p.user_id, p)
    }
    const merged: Comment[] = rows.map(r => {
      const p = profMap.get(r.user_id)
      return {
        ...r,
        author_name:   p?.display_name ?? null,
        author_avatar: p?.avatar_url ?? null,
      }
    })
    setComments(merged)
    onCountChangeRef.current?.(merged.length)
    setLoading(false)
  }, [postId])

  useEffect(() => { loadComments() }, [loadComments])

  // Realtime sur post_comments du post
  useEffect(() => {
    const ch = supabase
      .channel(`comments-${postId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_comments', filter: `post_id=eq.${postId}` }, () => loadComments())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [postId, loadComments])

  useEffect(() => {
    const t = setTimeout(() => textareaRef.current?.focus(), 120)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !sending) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, sending])

  async function handleSend() {
    if (sending || !user) return
    const trimmed = texte.trim()
    if (trimmed.length === 0) return
    setSending(true)
    const { data, error } = await supabase
      .from('post_comments')
      .insert({ post_id: postId, user_id: user.id, texte: trimmed })
      .select('id, user_id, texte, created_at')
      .single()
    if (error || !data) {
      toast.error(error?.message ?? 'Erreur')
      setSending(false)
      return
    }
    // Optimiste : on ajoute le commentaire localement tout de suite (instantané
    // garanti, sans dépendre du Realtime). Le Realtime rechargera derrière et
    // réconciliera ; dédup par id au cas où il arrive avant.
    setComments(prev => {
      if (prev.some(c => c.id === data.id)) return prev
      const next = [...prev, {
        ...data,
        author_name:   profile?.display_name ?? null,
        author_avatar: profile?.avatar_url ?? null,
      }]
      onCountChangeRef.current?.(next.length)
      return next
    })
    setTexte('')
    setSending(false)
  }

  async function handleDelete(commentId: string) {
    if (!confirm('Supprimer ce commentaire ?')) return
    const { error } = await supabase.from('post_comments').delete().eq('id', commentId)
    if (error) {
      toast.error(error.message)
      return
    }
    // Optimiste : retire localement tout de suite (le Realtime confirmera).
    setComments(prev => {
      const next = prev.filter(c => c.id !== commentId)
      onCountChangeRef.current?.(next.length)
      return next
    })
  }

  return (
    <ClientPortal>
    <div
      className="fixed inset-0 z-[3500] flex items-end justify-center bg-black/55 backdrop-blur-[3px] font-inter"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="flex w-full max-w-[480px] flex-col rounded-t-3xl bg-white"
        style={{ maxHeight: '85dvh', paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))' }}
      >
        <div className="mx-auto mt-3 mb-3 h-[5px] w-11 shrink-0 rounded-[3px] bg-[#E4DED2]" />

        <div
          className="flex shrink-0 items-center justify-between gap-3 px-4 pb-3"
          style={{ borderBottom: '1px solid #F0EAE0' }}
        >
          <h2 className="m-0 font-serif text-[17px] text-texte" style={{ letterSpacing: '-0.005em' }}>
            {comments.length === 0 ? 'Commentaires' : `${comments.length} commentaire${comments.length > 1 ? 's' : ''}`}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-9 w-9 items-center justify-center bg-transparent text-texte-doux"
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Liste scrollable */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading && comments.length === 0 && (
            <p className="py-6 text-center text-[12px] text-texte-doux">Chargement…</p>
          )}
          {!loading && comments.length === 0 && (
            <div className="flex flex-col items-center px-4 py-8 text-center">
              <p className="m-0 text-[13.5px] font-extrabold text-texte">Sois le premier à commenter</p>
              <p className="m-0 mt-1 text-[12px] text-texte-doux">Lance la conversation</p>
            </div>
          )}
          <div className="flex flex-col gap-3">
            {comments.map(c => (
              <CommentItem
                key={c.id}
                comment={c}
                canDelete={user?.id === c.user_id || user?.id === postAuthorId}
                onDelete={() => handleDelete(c.id)}
              />
            ))}
          </div>
        </div>

        {/* Composer */}
        {user && (
          <div
            className="flex shrink-0 items-end gap-2 px-3 pb-2 pt-3"
            style={{ borderTop: '1px solid #F0EAE0' }}
          >
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary font-serif text-[14px] text-white">
                {(profile?.display_name ?? user.email ?? '·').trim().charAt(0).toUpperCase() || '·'}
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={texte}
              onChange={e => setTexte(e.target.value.slice(0, MAX))}
              placeholder="Ajouter un commentaire…"
              rows={1}
              className="flex-1 resize-none rounded-[18px] border bg-white px-3.5 py-2 text-[13.5px] leading-[1.4] text-texte outline-none placeholder:text-texte-tres-doux"
              style={{ borderColor: '#E8E0D4', maxHeight: 120, colorScheme: 'light' }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
              }}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!texte.trim() || sending}
              aria-label="Envoyer"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white disabled:opacity-50"
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
    </ClientPortal>
  )
}

/* ── Comment item ─────────────────────────────────────────────────────── */
function CommentItem({
  comment, canDelete, onDelete,
}: { comment: Comment; canDelete: boolean; onDelete: () => void }) {
  const initial = (comment.author_name ?? '·').trim().charAt(0).toUpperCase() || '·'
  return (
    <div className="flex items-start gap-2.5">
      {comment.author_avatar ? (
        <img src={comment.author_avatar} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
      ) : (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary font-serif text-[14px] text-white">
          {initial}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div
          className="rounded-[14px] bg-cremeDeep px-3 py-2"
          style={{ wordBreak: 'break-word' }}
        >
          <Link
            href={`/profil/${comment.user_id}`}
            className="block text-[12.5px] font-extrabold text-texte no-underline"
            style={{ letterSpacing: '-0.005em' }}
          >
            {comment.author_name ?? 'Sans nom'}
          </Link>
          <p className="m-0 mt-0.5 whitespace-pre-wrap text-[13px] leading-[1.4] text-texte">
            {comment.texte}
          </p>
        </div>
        <div className="mt-1 flex items-center gap-3 px-2 text-[10.5px] text-texte-doux">
          <span>{formatDate(comment.created_at)}</span>
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="bg-transparent text-[10.5px] font-bold text-texte-doux"
            >
              Supprimer
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    const diffMs = Date.now() - d.getTime()
    const diffMins = diffMs / 60000
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
