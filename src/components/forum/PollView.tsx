'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { ForumPoll } from '@/lib/forum'

type Voter = { user_id: string; name: string }

/** Sondage affiché dans le premier post — barres de vote + temps réel. */
export default function PollView({ topicId, poll }: { topicId: string; poll: ForumPoll }) {
  const { user, isAdmin } = useAuth()
  const [counts, setCounts] = useState<number[]>(() => poll.options.map(() => 0))
  const [myVote, setMyVote] = useState<number | null>(null)
  const [voting, setVoting] = useState(false)
  // Admin : votants par option (noms cliquables → profil)
  const [voters, setVoters] = useState<Record<number, Voter[]>>({})
  const [showVoters, setShowVoters] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('forum_poll_votes')
      .select('user_id, option_index')
      .eq('topic_id', topicId)
    const rows = (data ?? []) as { user_id: string; option_index: number }[]
    const c = poll.options.map(() => 0)
    let mine: number | null = null
    for (const v of rows) {
      if (v.option_index >= 0 && v.option_index < c.length) c[v.option_index]++
      if (v.user_id === user?.id) mine = v.option_index
    }
    setCounts(c); setMyVote(mine)

    // Détail des votants : réservé à l'admin
    if (isAdmin && rows.length > 0) {
      const uids = Array.from(new Set(rows.map(r => r.user_id)))
      const { data: profs } = await supabase.from('profiles').select('user_id, display_name').in('user_id', uids)
      const nameById = new Map((profs ?? []).map((p: { user_id: string; display_name: string | null }) => [p.user_id, p.display_name]))
      const byOption: Record<number, Voter[]> = {}
      for (const v of rows) {
        if (v.option_index < 0 || v.option_index >= poll.options.length) continue
        ;(byOption[v.option_index] ??= []).push({ user_id: v.user_id, name: nameById.get(v.user_id) ?? 'Quelqu\'un' })
      }
      setVoters(byOption)
    } else setVoters({})
  }, [topicId, user?.id, isAdmin, poll.options])

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

      {/* Admin : détail des votants (noms cliquables → profil) */}
      {isAdmin && total > 0 && (
        <div className="mt-2 border-t pt-2" style={{ borderColor: '#E8E0D4' }}>
          <button
            type="button"
            onClick={() => setShowVoters(v => !v)}
            className="flex items-center gap-1.5 text-[11px] font-extrabold text-primary"
          >
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" style={{ transform: showVoters ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}><polyline points="9 6 15 12 9 18"/></svg>
            {showVoters ? 'Masquer les votants' : 'Voir qui a voté'}
            <span className="rounded-full bg-primary-light px-1.5 text-[9px] font-extrabold uppercase tracking-[0.04em] text-primary">admin</span>
          </button>
          {showVoters && (
            <div className="mt-2 flex flex-col gap-2">
              {poll.options.map((opt, i) => {
                const list = voters[i] ?? []
                return (
                  <div key={i}>
                    <div className="text-[11px] font-bold text-texte">
                      {opt} <span className="font-normal text-texte-doux">· {list.length}</span>
                    </div>
                    {list.length === 0 ? (
                      <div className="text-[11px] italic text-texte-doux">Personne</div>
                    ) : (
                      <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                        {list.map(v => (
                          <Link
                            key={v.user_id}
                            href={`/profil/${v.user_id}`}
                            className="text-[11.5px] font-semibold text-primary underline-offset-2 hover:underline"
                          >
                            {v.name}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
