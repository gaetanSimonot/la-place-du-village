'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import BottomNavBar from '@/components/BottomNavBar'
import ConversationListItem from '@/components/ConversationListItem'
import { ADAPTERS, SOURCE_META, type Source, type UnifiedConversation } from '@/lib/inbox-adapters'

type Filter = 'all' | Source

export default function MessagesClient() {
  const { user, loading: authLoading } = useAuth()
  const { openAuthModal } = useAuthModal()

  const [convs, setConvs]       = useState<UnifiedConversation[]>([])
  const [loading, setLoading]   = useState(true)
  const [errors, setErrors]     = useState<string[]>([])
  const [filter, setFilter]     = useState<Filter>('all')

  // Auth guard — sans user → ouvre la modal auth
  useEffect(() => {
    if (!authLoading && !user) openAuthModal('/messages')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user])

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setErrors([])
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setLoading(false); return }

    // Fetch parallèle de tous les adapters — erreurs isolées par source
    const results = await Promise.allSettled(ADAPTERS.map(a => a.fetch(token)))
    const merged: UnifiedConversation[] = []
    const errs: string[] = []
    results.forEach((r, i) => {
      const src = ADAPTERS[i].source
      if (r.status === 'fulfilled') merged.push(...r.value)
      else                          errs.push(`${SOURCE_META[src].label} : ${r.reason instanceof Error ? r.reason.message : 'Erreur'}`)
    })
    merged.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    setConvs(merged)
    setErrors(errs)
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  // Counts par source + total unread
  const { countsBySource, totalUnread } = useMemo(() => {
    const c: Record<Source, number> = { annonce: 0, covoit: 0, support: 0 }
    let u = 0
    for (const conv of convs) {
      c[conv.source]++
      u += conv.unreadCount
    }
    return { countsBySource: c, totalUnread: u }
  }, [convs])

  const visible = useMemo(
    () => filter === 'all' ? convs : convs.filter(c => c.source === filter),
    [convs, filter],
  )

  if (authLoading) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-creme">
        <div style={{ width: 28, height: 28, borderRadius: '50%', border: '4px solid #E0D8CE', borderTopColor: '#2D5A3D', animation: 'spin 0.7s linear infinite' }} />
      </main>
    )
  }
  if (!user) {
    return (
      <main className="min-h-[100dvh] bg-creme p-8 text-center font-inter">
        <p className="text-[14px] text-texte-doux">Connecte-toi pour voir tes messages.</p>
      </main>
    )
  }

  return (
    <main className="min-h-[100dvh] bg-creme pb-28 font-inter text-texte">
      {/* ─── Top bar ────────────────────────────────────── */}
      <div className="sticky top-0 z-30 flex items-center justify-between gap-2.5 border-b border-bordSoft bg-creme/95 px-4 py-3 backdrop-blur">
        <Link
          href="/"
          aria-label="Retour"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-bord bg-white text-texte"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <div className="font-serif text-[17px] leading-none text-texte" style={{ letterSpacing: '-0.01em' }}>
            Messages
          </div>
          <div className="mt-0.5 text-[10.5px] font-medium text-texte-doux">
            {totalUnread > 0
              ? `${totalUnread} non lu${totalUnread > 1 ? 's' : ''}`
              : `${convs.length} conversation${convs.length > 1 ? 's' : ''}`}
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          aria-label="Actualiser"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-bord bg-white text-texte"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/>
          </svg>
        </button>
      </div>

      {/* ─── Filtres source (chips) ─────────────────────── */}
      <div className="flex flex-wrap gap-1.5 px-4 pt-3">
        <FilterChip
          active={filter === 'all'}
          onClick={() => setFilter('all')}
          label="Toutes"
          count={convs.length}
        />
        {(['annonce', 'covoit', 'support'] as Source[]).map(s => (
          <FilterChip
            key={s}
            active={filter === s}
            onClick={() => setFilter(s)}
            label={SOURCE_META[s].label + 's'}
            count={countsBySource[s]}
            color={SOURCE_META[s].badgeBg}
          />
        ))}
      </div>

      {/* ─── Erreurs partielles (1 source en échec, les autres OK) ─── */}
      {errors.length > 0 && (
        <div className="mx-4 mt-3 rounded-xl border border-accent/30 bg-[#FFF3EE] p-2.5 text-[11px] text-accent">
          <p className="m-0 font-bold">Certaines conversations n&apos;ont pas pu être chargées :</p>
          <ul className="m-0 mt-1 list-disc pl-4">
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {/* ─── Liste ────────────────────────────────────── */}
      <div className="flex flex-col gap-2 px-4 pt-3">
        {loading && convs.length === 0 && (
          <p className="py-6 text-center text-[12px] text-texte-doux">Chargement…</p>
        )}
        {!loading && visible.length === 0 && (
          <div className="rounded-2xl border border-bordSoft bg-white p-6 text-center">
            <p className="m-0 mb-1 text-[14px] font-bold text-texte">
              {filter === 'all' ? 'Aucune conversation' : `Aucune conversation ${SOURCE_META[filter].label.toLowerCase()}`}
            </p>
            <p className="m-0 text-[12px] text-texte-doux">
              Tes échanges avec les autres habitants apparaîtront ici.
            </p>
          </div>
        )}
        {visible.map(c => <ConversationListItem key={`${c.source}-${c.id}`} conv={c} />)}
      </div>

      <BottomNavBar />
    </main>
  )
}

function FilterChip({
  active, onClick, label, count, color,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
  color?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-bold transition-colors ${
        active
          ? 'border-primary bg-primary text-white'
          : 'border-bord bg-white text-texte'
      }`}
      style={active && color ? { backgroundColor: color, color: 'inherit', borderColor: color } : undefined}
    >
      <span>{label}</span>
      <span className={`inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-extrabold ${
        active ? 'bg-white/30 text-current' : 'bg-cremeDeep text-texte-doux'
      }`}>
        {count}
      </span>
    </button>
  )
}
