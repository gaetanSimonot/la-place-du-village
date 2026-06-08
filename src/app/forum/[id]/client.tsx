'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import { shareLink } from '@/lib/share'
import BottomNavBar from '@/components/BottomNavBar'
import PostMedia from '@/components/profil/PostMedia'
import PollView from '@/components/forum/PollView'
import NewTopicModal from '@/components/forum/NewTopicModal'
import { type ForumTopic, type ForumComment, forumRelativeDate } from '@/lib/forum'

export default function TopicClient({ id }: { id: string }) {
  const router = useRouter()
  const { user, profile, isAdmin } = useAuth()
  const { openAuthModal } = useAuthModal()

  const [topic, setTopic] = useState<ForumTopic | null>(null)
  const [comments, setComments] = useState<ForumComment[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [text, setText]       = useState('')
  const [replyTo, setReplyTo] = useState<ForumComment | null>(null)
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [pollLocked, setPollLocked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [liked, setLiked] = useState(false)
  const [sending, setSending] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  async function authHeaders() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` }
  }

  const loadTopic = useCallback(async () => {
    const { data } = await supabase
      .from('forum_topics')
      .select('id, user_id, titre, corps, media, poll, pinned, comment_count, like_count, last_activity_at, created_at')
      .eq('id', id).maybeSingle()
    if (!data) { setNotFound(true); setLoading(false); return }
    const t = data as ForumTopic
    const { data: prof } = await supabase.from('profiles').select('display_name, avatar_url').eq('user_id', t.user_id).maybeSingle()
    const pr = prof as { display_name: string | null; avatar_url: string | null } | null
    setTopic({ ...t, author_name: pr?.display_name ?? null, author_avatar: pr?.avatar_url ?? null })
    setLikeCount(t.like_count ?? 0)
    setLoading(false)
    // Mon like + verrou sondage
    if (user) {
      const { data: myLike } = await supabase.from('forum_topic_likes').select('topic_id').eq('topic_id', id).eq('user_id', user.id).maybeSingle()
      setLiked(!!myLike)
    } else setLiked(false)
    if (t.poll) {
      const { count } = await supabase.from('forum_poll_votes').select('*', { count: 'exact', head: true }).eq('topic_id', id)
      setPollLocked((count ?? 0) > 0)
    } else setPollLocked(false)
  }, [id, user])

  const loadComments = useCallback(async () => {
    const { data: rows } = await supabase
      .from('forum_comments')
      .select('id, topic_id, user_id, texte, reply_to_id, edited_at, created_at')
      .eq('topic_id', id).order('created_at', { ascending: true }).limit(500)
    const base = (rows ?? []) as ForumComment[]
    const uids = Array.from(new Set(base.map(c => c.user_id)))
    let pm = new Map<string, { display_name: string | null; avatar_url: string | null }>()
    if (uids.length) {
      const { data: profs } = await supabase.from('profiles').select('user_id, display_name, avatar_url').in('user_id', uids)
      pm = new Map((profs ?? []).map((p: { user_id: string; display_name: string | null; avatar_url: string | null }) => [p.user_id, p]))
    }
    const byId = new Map(base.map(c => [c.id, c]))
    setComments(base.map(c => {
      const rt = c.reply_to_id ? byId.get(c.reply_to_id) : null
      return {
        ...c,
        author_name: pm.get(c.user_id)?.display_name ?? null,
        author_avatar: pm.get(c.user_id)?.avatar_url ?? null,
        reply_to: rt ? { author_name: pm.get(rt.user_id)?.display_name ?? null, texte: rt.texte } : null,
      }
    }))
  }, [id])

  useEffect(() => { loadTopic(); loadComments() }, [loadTopic, loadComments])
  useEffect(() => {
    const ch = supabase.channel(`forum-topic-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'forum_comments', filter: `topic_id=eq.${id}` }, () => loadComments())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'forum_topics', filter: `id=eq.${id}` }, () => loadTopic())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [id, loadTopic, loadComments])

  async function send() {
    if (!user) { openAuthModal(`/forum/${id}`); return }
    const t = text.trim()
    if (!t || sending) return
    setSending(true)
    try {
      const res = await fetch(`/api/forum/topics/${id}/comments`, {
        method: 'POST', headers: await authHeaders(),
        body: JSON.stringify({ texte: t, reply_to_id: replyTo?.id ?? null }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Erreur')
      // optimiste : ajoute tout de suite (le Realtime réconciliera)
      if (d.comment) {
        const c = d.comment as ForumComment
        setComments(prev => prev.some(x => x.id === c.id) ? prev : [...prev, {
          ...c,
          author_name: profile?.display_name ?? null,
          author_avatar: profile?.avatar_url ?? null,
          reply_to: replyTo ? { author_name: replyTo.author_name ?? null, texte: replyTo.texte } : null,
        }])
      }
      setText(''); setReplyTo(null)
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally { setSending(false) }
  }

  async function saveEdit() {
    if (!editing) return
    const t = editing.text.trim()
    if (!t) return
    const res = await fetch(`/api/forum/comments/${editing.id}`, { method: 'PATCH', headers: await authHeaders(), body: JSON.stringify({ texte: t }) })
    if (!res.ok) { toast.error('Édition échouée'); return }
    setComments(prev => prev.map(c => c.id === editing.id ? { ...c, texte: t, edited_at: new Date().toISOString() } : c))
    setEditing(null)
  }

  async function deleteComment(c: ForumComment) {
    if (!confirm('Supprimer cette réponse ?')) return
    const res = await fetch(`/api/forum/comments/${c.id}`, { method: 'DELETE', headers: await authHeaders() })
    if (!res.ok) { toast.error('Suppression échouée'); return }
    setComments(prev => prev.filter(x => x.id !== c.id))
  }

  async function toggleLike() {
    if (!user) { openAuthModal(`/forum/${id}`); return }
    const next = !liked
    setLiked(next); setLikeCount(c => Math.max(0, c + (next ? 1 : -1)))
    const res = await fetch(`/api/forum/topics/${id}/like`, { method: 'POST', headers: await authHeaders() })
    if (!res.ok) {
      setLiked(!next); setLikeCount(c => Math.max(0, c + (next ? -1 : 1)))
      toast.error('Action échouée')
    }
  }

  function shareTopic() {
    shareLink({
      title: topic?.titre ?? 'La Place Publique',
      text: 'Une discussion sur La Place du Village',
      url: `https://laplaceduvillage.app/forum/${id}`,
    })
  }

  async function togglePin() {
    if (!topic) return
    const res = await fetch(`/api/forum/topics/${id}`, { method: 'PATCH', headers: await authHeaders(), body: JSON.stringify({ pinned: !topic.pinned }) })
    if (!res.ok) { toast.error('Action échouée'); return }
    setTopic({ ...topic, pinned: !topic.pinned })
    toast.success(topic.pinned ? 'Désépinglé' : 'Épinglé')
  }

  async function deleteTopic() {
    if (!confirm('Supprimer ce sujet et toutes ses réponses ?')) return
    const res = await fetch(`/api/forum/topics/${id}`, { method: 'DELETE', headers: await authHeaders() })
    if (!res.ok) { toast.error('Suppression échouée'); return }
    router.push('/forum')
  }

  if (notFound) {
    return <div className="flex min-h-[100dvh] items-center justify-center bg-creme font-inter text-[14px] text-texte-doux">Ce sujet n&apos;existe plus.</div>
  }

  const topicOwner = !!user && topic?.user_id === user.id

  return (
    <div className="min-h-[100dvh] bg-creme font-inter text-texte" style={{ paddingBottom: 132 }}>
      {/* Top bar */}
      <div className="flex items-center gap-2.5 px-4 pt-3.5">
        <button onClick={() => router.push('/forum')} aria-label="Retour" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-bord bg-white text-texte">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        </button>
        <div className="flex-1 truncate font-serif text-[15px] text-texte">La Place Publique</div>
        <div className="flex shrink-0 items-center gap-2">
          {topic && (
            <button onClick={shareTopic} aria-label="Partager" className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-bord bg-white text-texte">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            </button>
          )}
          {isAdmin && topic && (
            <button onClick={togglePin} className="rounded-lg border border-bord bg-white px-2.5 py-1.5 text-[11px] font-bold text-texte" title="Épingler">
              {topic.pinned ? '📌 Désépingler' : '📌 Épingler'}
            </button>
          )}
          {(topicOwner || isAdmin) && topic && (
            <button onClick={() => setEditOpen(true)} className="rounded-lg border border-bord bg-white px-2.5 py-1.5 text-[11px] font-bold text-texte">Éditer</button>
          )}
          {(topicOwner || isAdmin) && (
            <button onClick={deleteTopic} className="rounded-lg border border-accent bg-white px-2.5 py-1.5 text-[11px] font-bold text-accent">Suppr</button>
          )}
        </div>
      </div>

      {loading && !topic ? (
        <p className="py-10 text-center text-[12px] text-texte-doux">Chargement…</p>
      ) : topic ? (
        <>
          {/* ── Premier post ── */}
          {(() => {
            const headerItem = topic.media?.find(m => m.t === 'photo') ?? null
            const headerPhoto = headerItem && headerItem.t === 'photo' ? headerItem.url : null
            const restMedia = topic.media ? topic.media.filter(m => m !== headerItem) : null
            const hasBody = !!topic.corps || (restMedia != null && restMedia.length > 0) || !!topic.poll
            return (
              <div className="px-4 pt-4">
                {headerPhoto ? (
                  <>
                    {/* Header : photo + gradient + titre lisible dessus (style carrousel) */}
                    <div className="relative overflow-hidden rounded-[16px]" style={{ boxShadow: '0 6px 20px rgba(44,28,16,0.12)' }}>
                      <img src={headerPhoto} alt="" className="h-[210px] w-full object-cover" />
                      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.12) 35%, rgba(0,0,0,0.82) 100%)' }} />
                      {topic.pinned && <span className="absolute left-3 top-3 inline-block rounded-full bg-primary-light/95 px-2 py-[3px] text-[9px] font-extrabold uppercase tracking-[0.06em] text-primary">📌 Épinglé</span>}
                      <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
                        <h1 className="m-0 font-serif text-[23px] leading-[1.12] text-white" style={{ letterSpacing: '-0.01em', textShadow: '0 1px 12px rgba(0,0,0,0.45)' }}>{topic.titre}</h1>
                        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-white/85">
                          <span className="font-bold">{topic.author_name ?? 'Quelqu\'un'}</span>
                          <span aria-hidden>·</span>
                          <span>{forumRelativeDate(topic.created_at)}</span>
                        </div>
                      </div>
                    </div>
                    {hasBody && (
                      <div className="mt-3 rounded-[16px] border bg-white p-4" style={{ borderColor: '#F0EAE0', boxShadow: '0 1px 4px rgba(44,28,16,0.04)' }}>
                        {topic.corps && <p className="m-0 whitespace-pre-wrap text-[14.5px] leading-[1.55] text-texte" style={{ wordBreak: 'break-word' }}>{topic.corps}</p>}
                        {restMedia && restMedia.length > 0 && <div className={topic.corps ? 'mt-3' : ''}><PostMedia media={restMedia} /></div>}
                        {topic.poll && <div className={topic.corps || (restMedia && restMedia.length > 0) ? 'mt-3' : ''}><PollView topicId={id} poll={topic.poll} /></div>}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="rounded-[16px] border bg-white p-4" style={{ borderColor: '#F0EAE0', boxShadow: '0 1px 4px rgba(44,28,16,0.04)' }}>
                    {topic.pinned && <span className="mb-1.5 inline-block rounded-full bg-primary-light px-2 py-[2px] text-[9px] font-extrabold uppercase tracking-[0.06em] text-primary">📌 Épinglé</span>}
                    <h1 className="m-0 font-serif text-[22px] leading-[1.15] text-texte" style={{ letterSpacing: '-0.01em' }}>{topic.titre}</h1>
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-texte-doux">
                      <span className="font-bold text-texte">{topic.author_name ?? 'Quelqu\'un'}</span>
                      <span aria-hidden>·</span>
                      <span>{forumRelativeDate(topic.created_at)}</span>
                    </div>
                    {topic.corps && <p className="m-0 mt-3 whitespace-pre-wrap text-[14.5px] leading-[1.55] text-texte" style={{ wordBreak: 'break-word' }}>{topic.corps}</p>}
                    {topic.poll && <div className="mt-3"><PollView topicId={id} poll={topic.poll} /></div>}
                  </div>
                )}
              </div>
            )
          })()}

          {/* ── J'aime + partage ── */}
          <div className="flex items-center gap-2 px-4 pt-3">
            <button
              onClick={toggleLike}
              className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12.5px] font-bold"
              style={{ borderColor: liked ? 'var(--primary)' : '#E8E0D4', background: liked ? 'var(--primary-light)' : '#fff', color: liked ? 'var(--primary)' : '#1A1209' }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              J&apos;aime{likeCount > 0 ? ` · ${likeCount}` : ''}
            </button>
            <button
              onClick={shareTopic}
              className="inline-flex items-center gap-1.5 rounded-full border bg-white px-3.5 py-1.5 text-[12.5px] font-bold text-texte"
              style={{ borderColor: '#E8E0D4' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              Partager
            </button>
          </div>

          {/* ── Fil de réponses ── */}
          <div className="px-4 pt-4">
            <div className="mb-2 text-[12px] font-extrabold uppercase tracking-[0.08em] text-texte-doux">
              {comments.length} réponse{comments.length > 1 ? 's' : ''}
            </div>
            <div className="flex flex-col gap-2">
              {comments.map(c => {
                const own = !!user && c.user_id === user.id
                const isEditing = editing?.id === c.id
                return (
                  <div key={c.id} className="rounded-[12px] border bg-white px-3 py-2.5" style={{ borderColor: '#F0EAE0' }}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[11px] text-texte-doux">
                        <span className="font-bold text-texte">{c.author_name ?? 'Quelqu\'un'}</span>
                        <span aria-hidden>·</span>
                        <span>{forumRelativeDate(c.created_at)}</span>
                        {c.edited_at && <span className="italic">· modifié</span>}
                      </div>
                      <div className="flex shrink-0 gap-2 text-[10.5px] font-bold">
                        <button onClick={() => { if (!user) { openAuthModal(`/forum/${id}`); return } setReplyTo(c) }} className="text-primary">Citer</button>
                        {own && <button onClick={() => setEditing({ id: c.id, text: c.texte })} className="text-texte-doux">Éditer</button>}
                        {(own || isAdmin) && <button onClick={() => deleteComment(c)} className="text-accent">Suppr</button>}
                      </div>
                    </div>
                    {c.reply_to && (
                      <div className="mt-1.5 border-l-2 pl-2 text-[11.5px] italic text-texte-doux" style={{ borderColor: '#E8E0D4' }}>
                        <span className="font-bold not-italic">{c.reply_to.author_name ?? 'Quelqu\'un'} :</span> {c.reply_to.texte.length > 100 ? c.reply_to.texte.slice(0, 100) + '…' : c.reply_to.texte}
                      </div>
                    )}
                    {isEditing ? (
                      <div className="mt-1.5">
                        <textarea value={editing.text} onChange={e => setEditing({ id: c.id, text: e.target.value.slice(0, 5000) })} rows={3} className="block w-full resize-none rounded-[10px] border px-3 py-2 text-[14px] outline-none" style={{ borderColor: '#E8E0D4', background: '#FBF7F0', colorScheme: 'light' }} />
                        <div className="mt-1.5 flex gap-2">
                          <button onClick={saveEdit} className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-white">Enregistrer</button>
                          <button onClick={() => setEditing(null)} className="rounded-lg border border-bord bg-white px-3 py-1.5 text-[11px] font-bold text-texte-doux">Annuler</button>
                        </div>
                      </div>
                    ) : (
                      <p className="m-0 mt-1 whitespace-pre-wrap text-[14px] leading-[1.5] text-texte" style={{ wordBreak: 'break-word' }}>{c.texte}</p>
                    )}
                  </div>
                )
              })}
              <div ref={endRef} aria-hidden />
            </div>
          </div>
        </>
      ) : null}

      {/* ── Composer fixe (au-dessus de la BottomNavBar) ── */}
      <div className="fixed left-0 right-0 z-30 border-t bg-creme/95 backdrop-blur" style={{ bottom: 64, borderColor: '#E8E0D4' }}>
        {replyTo && (
          <div className="flex items-center justify-between gap-2 px-3 pt-2 text-[11px] text-texte-doux">
            <span className="truncate">↪ Réponse à <strong>{replyTo.author_name ?? 'Quelqu\'un'}</strong></span>
            <button onClick={() => setReplyTo(null)} className="font-bold text-accent">×</button>
          </div>
        )}
        <div className="flex items-end gap-2 px-3 py-2.5">
          <textarea
            value={text}
            onChange={e => setText(e.target.value.slice(0, 5000))}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder={user ? 'Écrire une réponse…' : 'Connecte-toi pour répondre'}
            rows={1}
            className="max-h-[120px] flex-1 resize-none rounded-[18px] border bg-white px-3.5 py-2 text-[13.5px] leading-[1.4] text-texte outline-none placeholder:text-texte-tres-doux"
            style={{ borderColor: '#E8E0D4', colorScheme: 'light' }}
          />
          <button onClick={send} disabled={!text.trim() || sending} aria-label="Envoyer" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white disabled:opacity-50">
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
      </div>

      {editOpen && topic && (
        <NewTopicModal
          editTopic={{ id: topic.id, titre: topic.titre, corps: topic.corps, media: topic.media, poll: topic.poll }}
          pollLocked={pollLocked}
          onClose={() => setEditOpen(false)}
          onUpdated={patch => {
            setTopic(t => t ? { ...t, titre: patch.titre, corps: patch.corps, media: patch.media.length ? patch.media : null, poll: patch.poll } : t)
            toast.success('Sujet modifié')
          }}
        />
      )}

      <BottomNavBar />
    </div>
  )
}
