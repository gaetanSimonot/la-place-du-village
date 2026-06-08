'use client'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { ForumPoll } from '@/lib/forum'

/** Sondage affiché dans le premier post — barres de vote + temps réel. */
export default function PollView({ topicId, poll }: { topicId: string; poll: ForumPoll }) {
  const { user } = useAuth()
  const [counts, setCounts] = useState<number[]>(() => poll.options.map(() => 0))
  const [myVote, setMyVote] = useState<number | null>(null)
  const [voting, setVoting] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('forum_poll_votes')
      .select('user_id, option_index')
      .eq('topic_id', topicId)
    const c = poll.options.map(() => 0)
    let mine: number | null = null
    for (const v of (data ?? []) as { user_id: string; option_index: number }[]) {
      if (v.option_index >= 0 && v.option_index < c.length) c[v.option_index]++
      if (v.user_id === user?.id) mine = v.option_index
    }
    setCounts(c); setMyVote(mine)
  }, [topicId, user?.id, poll.options])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const ch = supabase
      .channel(`poll-${topicId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'forum_poll_votes', filter: `topic_id=eq.${topicId}` }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [topicId, load])

  const total = counts.reduce((a, b) => a + b, 0)

  async function vote(i: number) {
    if (!user) { toast.error('Connecte-toi pour voter'); return }
    if (voting) return
    setVoting(true)
    setMyVote(i) // optimistic
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/forum/topics/${topicId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ option_index: i }),
      })
      if (!res.ok) toast.error('Vote échoué')
    } finally {
      setVoting(false)
      load()
    }
  }

  return (
    <div className="rounded-[14px] border bg-cremeDeep p-3" style={{ borderColor: '#E8E0D4' }}>
      <div className="mb-2 flex items-center gap-1.5 text-[12px] font-extrabold text-texte">
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
        {poll.question}
      </div>
      <div className="flex flex-col gap-1.5">
        {poll.options.map((opt, i) => {
          const c = counts[i] ?? 0
          const pct = total ? Math.round((c / total) * 100) : 0
          const mine = myVote === i
          return (
            <button
              key={i}
              type="button"
              onClick={() => vote(i)}
              disabled={voting}
              className="relative overflow-hidden rounded-[10px] border px-3 py-2 text-left"
              style={{ borderColor: mine ? 'var(--primary)' : '#E8E0D4', background: '#fff' }}
            >
              <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: mine ? 'var(--primary-light)' : '#F0EAE0', transition: 'width 0.3s' }} />
              <div className="relative flex items-center justify-between gap-2">
                <span className="text-[13px] font-bold" style={{ color: mine ? 'var(--primary)' : '#1A1209' }}>
                  {mine && '✓ '}{opt}
                </span>
                {total > 0 && <span className="text-[11px] font-bold text-texte-doux">{pct}% · {c}</span>}
              </div>
            </button>
          )
        })}
      </div>
      <div className="mt-1.5 text-[11px] text-texte-doux">{total} vote{total > 1 ? 's' : ''}</div>
    </div>
  )
}
