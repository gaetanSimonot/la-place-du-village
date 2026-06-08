'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import { shareLink } from '@/lib/share'
import { toast } from 'sonner'
import BottomNavBar from '@/components/BottomNavBar'
import NewTopicModal from '@/components/forum/NewTopicModal'
import { type ForumTopic, forumRelativeDate } from '@/lib/forum'

export default function ForumClient() {
  const router = useRouter()
  const { user } = useAuth()
  const { openAuthModal } = useAuthModal()
  const [topics, setTopics] = useState<ForumTopic[]>([])
  const [pollCounts, setPollCounts] = useState<Record<string, number[]>>({})
  const [myLikes, setMyLikes] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [composerOpen, setComposerOpen] = useState(false)

  const load = useCallback(async () => {
    const { data: rows } = await supabase
      .from('forum_topics')
      .select('id, user_id, titre, corps, media, poll, pinned, comment_count, like_count, last_activity_at, created_at')
      .order('pinned', { ascending: false })
      .order('comment_count', { ascending: false })
      .order('last_activity_at', { ascending: false })
      .limit(60)
    const base = (rows ?? []) as ForumTopic[]
    if (base.length === 0) { setTopics([]); setPollCounts({}); setLoading(false); return }
    const ids = Array.from(new Set(base.map(t => t.user_id)))
    const { data: profs } = await supabase.from('profiles').select('user_id, display_name, avatar_url').in('user_id', ids)
    const pm = new Map((profs ?? []).map((p: { user_id: string; display_name: string | null; avatar_url: string | null }) => [p.user_id, p]))
    setTopics(base.map(t => ({ ...t, author_name: pm.get(t.user_id)?.display_name ?? null, author_avatar: pm.get(t.user_id)?.avatar_url ?? null })))
    setLoading(false)

    // Mes likes (pour l'état du bouton J'aime sur chaque miniature)
    if (user) {
      const { data: likes } = await supabase.from('forum_topic_likes').select('topic_id').eq('user_id', user.id).in('topic_id', base.map(t => t.id))
      setMyLikes(new Set((likes ?? []).map((l: { topic_id: string }) => l.topic_id)))
    } else setMyLikes(new Set())

    // Résultats des sondages (comptés par sujet) pour affichage dans la miniature
    const pollTopics = base.filter(t => t.poll)
    if (pollTopics.length === 0) { setPollCounts({}); return }
    const { data: votes } = await supabase
      .from('forum_poll_votes')
      .select('topic_id, option_index')
      .in('topic_id', pollTopics.map(t => t.id))
    const counts = new Map(pollTopics.map(t => [t.id, t.poll!.options.map(() => 0)]))
    for (const v of (votes ?? []) as { topic_id: string; option_index: number }[]) {
      const arr = counts.get(v.topic_id)
      if (arr && v.option_index >= 0 && v.option_index < arr.length) arr[v.option_index]++
    }
    setPollCounts(Object.fromEntries(counts))
  }, [user])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const ch = supabase.channel('forum-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'forum_topics' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'forum_poll_votes' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'forum_topic_likes' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  async function toggleLike(t: ForumTopic) {
    if (!user) { openAuthModal('/forum'); return }
    const liked = myLikes.has(t.id)
    // optimiste
    setMyLikes(prev => { const n = new Set(prev); if (liked) n.delete(t.id); else n.add(t.id); return n })
    setTopics(prev => prev.map(x => x.id === t.id ? { ...x, like_count: Math.max(0, x.like_count + (liked ? -1 : 1)) } : x))
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/api/forum/topics/${t.id}/like`, { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token ?? ''}` } })
    if (!res.ok) {
      // revert
      setMyLikes(prev => { const n = new Set(prev); if (liked) n.add(t.id); else n.delete(t.id); return n })
      setTopics(prev => prev.map(x => x.id === t.id ? { ...x, like_count: Math.max(0, x.like_count + (liked ? 1 : -1)) } : x))
      toast.error('Action échouée')
    }
  }

  function shareTopic(t: ForumTopic) {
    shareLink({ title: t.titre, text: 'Une discussion sur La Place du Village', url: `https://laplaceduvillage.app/forum/${t.id}` })
  }

  function newTopic() {
    if (!user) { openAuthModal('/forum'); return }
    setComposerOpen(true)
  }

  return (
    <div className="min-h-[100dvh] bg-creme pb-24 font-inter text-texte">
      {/* Top bar */}
      <div className="flex items-center gap-2.5 px-4 pt-3.5">
        <button onClick={() => router.push('/')} aria-label="Retour" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-bord bg-white text-texte">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        </button>
        <div className="min-w-0 flex-1">
          <div className="font-serif text-[20px] leading-none text-texte" style={{ letterSpacing: '-0.01em' }}>La Place Publique</div>
          <div className="mt-0.5 text-[11px] text-texte-doux">Lance un sujet, débats, sondages</div>
        </div>
      </div>

      {/* CTA */}
      <div className="px-4 pt-4">
        <button onClick={newTopic} className="flex w-full items-center gap-2.5 rounded-[14px] border bg-white px-3.5 py-3 text-left" style={{ borderColor: '#F0EAE0', boxShadow: '0 1px 4px rgba(44,28,16,0.04)' }}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-white">
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </span>
          <span className="text-[13px] font-bold text-texte-doux">Lancer un nouveau sujet…</span>
        </button>
      </div>

      {/* Liste */}
      <div className="mt-3 flex flex-col gap-2 px-4">
        {loading && topics.length === 0 && <p className="py-8 text-center text-[12px] text-texte-doux">Chargement…</p>}
        {!loading && topics.length === 0 && (
          <div className="px-4 py-12 text-center">
            <p className="m-0 text-[14px] font-extrabold text-texte">Aucun sujet pour l&apos;instant</p>
            <p className="m-0 mt-1 text-[12px] text-texte-doux">Sois le premier à lancer une discussion.</p>
          </div>
        )}
        {topics.map(t => {
          const liked = myLikes.has(t.id)
          return (
          <div
            key={t.id}
            role="button"
            tabIndex={0}
            onClick={() => router.push(`/forum/${t.id}`)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(`/forum/${t.id}`) } }}
            className="cursor-pointer rounded-[14px] border bg-white px-3.5 py-3 text-left"
            style={{ borderColor: t.pinned ? 'var(--primary)' : '#F0EAE0', boxShadow: '0 1px 4px rgba(44,28,16,0.04)' }}
          >
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                {t.pinned && (
                  <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-primary-light px-2 py-[2px] text-[9px] font-extrabold uppercase tracking-[0.06em] text-primary">
                    📌 Épinglé
                  </span>
                )}
                <div className="font-serif text-[16px] leading-[1.2] text-texte" style={{ letterSpacing: '-0.005em' }}>{t.titre}</div>
                {t.corps && <p className="m-0 mt-1 line-clamp-2 text-[12.5px] leading-[1.4] text-texte-doux">{t.corps}</p>}
                <div className="mt-1.5 flex items-center gap-2 text-[11px] text-texte-doux">
                  <span className="truncate">{t.author_name ?? 'Quelqu\'un'}</span>
                  <span aria-hidden>·</span>
                  <span>{forumRelativeDate(t.last_activity_at)}</span>
                  {t.poll && <span className="rounded-full bg-[#FFF7DC] px-1.5 text-[9px] font-extrabold text-[#A8770F]">SONDAGE</span>}
                </div>
                {t.poll && (() => {
                  const counts = pollCounts[t.id] ?? t.poll.options.map(() => 0)
                  const total = counts.reduce((a, b) => a + b, 0)
                  return (
                    <div className="mt-2 rounded-[10px] border bg-cremeDeep px-2.5 py-2" style={{ borderColor: '#E8E0D4' }}>
                      <div className="mb-1.5 flex items-center gap-1.5 truncate text-[11px] font-extrabold text-texte">
                        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                        <span className="truncate">{t.poll.question}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        {t.poll.options.map((opt, i) => {
                          const c = counts[i] ?? 0
                          const pct = total ? Math.round((c / total) * 100) : 0
                          return (
                            <div key={i} className="relative overflow-hidden rounded-[7px] border px-2 py-1" style={{ borderColor: '#E8E0D4', background: '#fff' }}>
                              <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: '#F0EAE0' }} />
                              <div className="relative flex items-center justify-between gap-2">
                                <span className="truncate text-[11.5px] font-bold text-texte">{opt}</span>
                                {total > 0 && <span className="shrink-0 text-[10px] font-bold text-texte-doux">{pct}%</span>}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <div className="mt-1 text-[10px] text-texte-doux">{total} vote{total > 1 ? 's' : ''}</div>
                    </div>
                  )
                })()}
              </div>
              <div className="flex shrink-0 flex-col items-center rounded-[10px] bg-cremeDeep px-2.5 py-1.5">
                <span className="text-[15px] font-extrabold leading-none text-primary">{t.comment_count}</span>
                <span className="text-[9px] text-texte-doux">rép.</span>
              </div>
            </div>

            {/* Actions : J'aime + Partager */}
            <div className="mt-2.5 flex items-center gap-2 border-t pt-2.5" style={{ borderColor: '#F4EEE4' }}>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); toggleLike(t) }}
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-bold"
                style={{ borderColor: liked ? 'var(--primary)' : '#E8E0D4', background: liked ? 'var(--primary-light)' : '#fff', color: liked ? 'var(--primary)' : '#1A1209' }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                J&apos;aime{t.like_count > 0 ? ` · ${t.like_count}` : ''}
              </button>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); shareTopic(t) }}
                className="inline-flex items-center gap-1.5 rounded-full border bg-white px-2.5 py-1 text-[11.5px] font-bold text-texte"
                style={{ borderColor: '#E8E0D4' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                Partager
              </button>
            </div>
          </div>
          )
        })}
      </div>

      {composerOpen && (
        <NewTopicModal onClose={() => setComposerOpen(false)} onCreated={id => { setComposerOpen(false); router.push(`/forum/${id}`) }} />
      )}

      <BottomNavBar />
    </div>
  )
}
