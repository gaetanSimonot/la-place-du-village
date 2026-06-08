'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import BottomNavBar from '@/components/BottomNavBar'
import NewTopicModal from '@/components/forum/NewTopicModal'
import { type ForumTopic, forumRelativeDate } from '@/lib/forum'

export default function ForumClient() {
  const router = useRouter()
  const { user } = useAuth()
  const { openAuthModal } = useAuthModal()
  const [topics, setTopics] = useState<ForumTopic[]>([])
  const [loading, setLoading] = useState(true)
  const [composerOpen, setComposerOpen] = useState(false)

  const load = useCallback(async () => {
    const { data: rows } = await supabase
      .from('forum_topics')
      .select('id, user_id, titre, corps, media, poll, pinned, comment_count, last_activity_at, created_at')
      .order('pinned', { ascending: false })
      .order('comment_count', { ascending: false })
      .order('last_activity_at', { ascending: false })
      .limit(60)
    const base = (rows ?? []) as ForumTopic[]
    if (base.length === 0) { setTopics([]); setLoading(false); return }
    const ids = Array.from(new Set(base.map(t => t.user_id)))
    const { data: profs } = await supabase.from('profiles').select('user_id, display_name, avatar_url').in('user_id', ids)
    const pm = new Map((profs ?? []).map((p: { user_id: string; display_name: string | null; avatar_url: string | null }) => [p.user_id, p]))
    setTopics(base.map(t => ({ ...t, author_name: pm.get(t.user_id)?.display_name ?? null, author_avatar: pm.get(t.user_id)?.avatar_url ?? null })))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const ch = supabase.channel('forum-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'forum_topics' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

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
        {topics.map(t => (
          <button
            key={t.id}
            onClick={() => router.push(`/forum/${t.id}`)}
            className="rounded-[14px] border bg-white px-3.5 py-3 text-left"
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
              </div>
              <div className="flex shrink-0 flex-col items-center rounded-[10px] bg-cremeDeep px-2.5 py-1.5">
                <span className="text-[15px] font-extrabold leading-none text-primary">{t.comment_count}</span>
                <span className="text-[9px] text-texte-doux">rép.</span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {composerOpen && (
        <NewTopicModal onClose={() => setComposerOpen(false)} onCreated={id => { setComposerOpen(false); router.push(`/forum/${id}`) }} />
      )}

      <BottomNavBar />
    </div>
  )
}
