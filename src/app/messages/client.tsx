'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import BottomNavBar from '@/components/BottomNavBar'
import { ADAPTERS, SOURCE_META, type Source, type UnifiedConversation } from '@/lib/inbox-adapters'

type Filter = 'all' | Source

/* ── Couleurs catégorielles fidèles au mockup MessagerieScreen ─────── */
const CAT_TAG: Record<Source, { label: string; bg: string; color: string }> = {
  friend:  { label: 'AMI',     bg: '#E8F2EB', color: '#2D5A3D' },
  annonce: { label: 'ANNONCE', bg: '#FFF0E5', color: '#C84B2F' },
  covoit:  { label: 'COVOIT.', bg: '#E8EEF7', color: '#3A5D8C' },
  support: { label: 'SUPPORT', bg: '#F0EBE3', color: '#7C5C3B' },
}

/* ── Icons inline ─────────────────────────────────────────────────────── */
const IcBack = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
  </svg>
)
const IcEdit = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
)
const IcSearch = () => (
  <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" />
  </svg>
)
export default function MessagesClient() {
  const { user, loading: authLoading } = useAuth()
  const { openAuthModal } = useAuthModal()

  const [convs, setConvs]       = useState<UnifiedConversation[]>([])
  const [loading, setLoading]   = useState(true)
  const [errors, setErrors]     = useState<string[]>([])
  const [filter, setFilter]     = useState<Filter>('all')
  const [search, setSearch]     = useState('')

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

  const countsBySource = useMemo(() => {
    const c: Record<Source, number> = { annonce: 0, covoit: 0, support: 0, friend: 0 }
    for (const conv of convs) c[conv.source]++
    return c
  }, [convs])

  const visible = useMemo(() => {
    let list = filter === 'all' ? convs : convs.filter(c => c.source === filter)
    const q = search.trim().toLowerCase()
    if (q.length >= 2) {
      list = list.filter(c =>
        (c.title ?? '').toLowerCase().includes(q) ||
        (c.otherName ?? '').toLowerCase().includes(q) ||
        (c.lastMessage?.content ?? '').toLowerCase().includes(q),
      )
    }
    return list
  }, [convs, filter, search])

  if (authLoading) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-creme">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-bord border-t-primary" />
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
      {/* ── Top bar ──────────────────────────────────── */}
      <div
        className="flex items-center justify-between gap-2.5 px-4 pt-3.5"
        style={{ paddingTop: 'max(14px, env(safe-area-inset-top, 14px))' }}
      >
        <Link
          href="/"
          aria-label="Retour"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border bg-white text-texte"
          style={{ borderColor: '#E8E0D4', boxShadow: '0 1px 2px rgba(44,28,16,0.04)' }}
        >
          <IcBack />
        </Link>
        <div
          className="font-serif text-[18px] leading-none text-texte"
          style={{ letterSpacing: '-0.005em' }}
        >
          Messages
        </div>
        <button
          type="button"
          onClick={() => toast('Nouvelle conversation bientôt', { description: 'Tu pourras lancer un fil depuis le profil de quelqu\'un.' })}
          aria-label="Nouvelle conversation"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-primary text-white"
          style={{ boxShadow: '0 1px 2px rgba(44,28,16,0.04)' }}
        >
          <IcEdit />
        </button>
      </div>

      {/* ── Search bar ───────────────────────────────── */}
      <div className="px-4 pt-3.5">
        <div
          className="flex items-center gap-2.5 rounded-[14px] border bg-white px-3.5 py-[11px]"
          style={{ borderColor: '#E8E0D4', boxShadow: '0 1px 4px rgba(44,28,16,0.04)' }}
        >
          <span className="text-texte-doux"><IcSearch /></span>
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Chercher dans mes messages…"
            className="flex-1 bg-transparent text-[13px] font-medium text-texte placeholder:text-texte-tres-doux focus:outline-none"
          />
        </div>
      </div>

      {/* ── Pills catégories — flex-wrap (pas de scroll horizontal) ─── */}
      <div className="flex flex-wrap gap-1.5 px-4 pt-3.5">
        <CatPill
          active={filter === 'all'}
          onClick={() => setFilter('all')}
          label="Toutes"
          count={convs.length}
        />
        {(['friend', 'annonce', 'covoit', 'support'] as Source[]).map(s => (
          <CatPill
            key={s}
            active={filter === s}
            onClick={() => setFilter(s)}
            label={s === 'covoit' ? 'Covoit.' : s === 'annonce' ? 'Annonces' : s === 'friend' ? 'Amis' : 'Support'}
            count={countsBySource[s]}
          />
        ))}
      </div>

      {/* ── Banner demandes — masquée V1 (pas encore de séparation inconnus/amis dans la DB) ── */}
      {/* TODO PR future : banner conditionnelle quand on aura un vrai concept "demande d'inconnu" */}

      {/* ── Erreurs partielles ──────────────────────── */}
      {errors.length > 0 && (
        <div
          className="mx-4 mt-3 rounded-[12px] border px-3 py-2.5 text-[11px] text-accent"
          style={{ borderColor: '#F0D4C8', background: '#FFF0E5' }}
        >
          <p className="m-0 font-bold">Certaines conversations n&apos;ont pas pu être chargées :</p>
          <ul className="m-0 mt-1 list-disc pl-4">
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {/* ── Liste ────────────────────────────────────── */}
      <div className="pt-3.5">
        {loading && convs.length === 0 && (
          <p className="px-4 py-6 text-center text-[12px] text-texte-doux">Chargement…</p>
        )}
        {!loading && visible.length === 0 && (
          <div className="mx-4 rounded-[14px] border bg-white p-6 text-center" style={{ borderColor: '#F0EAE0' }}>
            <p className="m-0 mb-1 text-[14px] font-extrabold text-texte">
              {search.trim().length >= 2
                ? 'Aucun résultat'
                : filter === 'all'
                  ? 'Aucune conversation'
                  : 'Aucune conversation dans cette catégorie'}
            </p>
            <p className="m-0 text-[12px] text-texte-doux">
              Tes échanges avec les autres habitants apparaîtront ici.
            </p>
          </div>
        )}
        {visible.map(c => <ConvoRow key={`${c.source}-${c.id}`} conv={c} />)}
      </div>

      <BottomNavBar />
    </main>
  )
}

/* ── Pill catégorie ──────────────────────────────────────────────────── */
function CatPill({
  active, onClick, label, count,
}: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-[7px] text-[12px] font-bold"
      style={{
        background: active ? '#1A1209' : '#FFFFFF',
        color: active ? '#FDFAF5' : '#1A1209',
        borderColor: active ? '#1A1209' : '#E8E0D4',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
      <span
        className="text-[10px] font-extrabold"
        style={{ opacity: active ? 0.85 : 0.7 }}
      >
        {count}
      </span>
    </button>
  )
}

/* ── Conversation row fidèle au mockup MessagerieScreen ─────────────── */
function ConvoRow({ conv }: { conv: UnifiedConversation }) {
  const tag = CAT_TAG[conv.source]
  const unread = conv.unreadCount > 0
  const initial = (conv.otherName ?? conv.title).trim().charAt(0).toUpperCase() || '·'

  return (
    <Link
      href={conv.href}
      className="flex w-full items-start gap-[11px] bg-transparent px-4 py-3 text-inherit no-underline"
      style={{ borderBottom: '1px solid #F0EAE0' }}
    >
      {/* Avatar 48px */}
      {conv.otherAvatar ? (
        <img
          src={conv.otherAvatar}
          alt=""
          className="h-12 w-12 shrink-0 rounded-full object-cover"
          style={{ border: '2px solid #FDFAF5' }}
        />
      ) : (
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary font-serif text-[20px] text-white"
          style={{ border: '2px solid #FDFAF5' }}
        >
          {initial}
        </div>
      )}

      {/* Bloc texte */}
      <div className="min-w-0 flex-1 pt-[1px]">
        {/* Tag catégorie */}
        <div className="mb-[3px]">
          <span
            className="inline-block rounded-[5px] px-[6px] py-[2px] text-[8.5px] font-extrabold uppercase"
            style={{ background: tag.bg, color: tag.color, letterSpacing: '0.06em' }}
          >
            {tag.label}
          </span>
        </div>

        {/* Nom + heure */}
        <div className="flex items-baseline justify-between gap-2">
          <div
            className="flex-1 truncate text-[14px] text-texte"
            style={{ letterSpacing: '-0.005em', fontWeight: unread ? 800 : 700 }}
          >
            {conv.otherName ?? conv.title}
          </div>
          <div className="shrink-0 text-[10.5px] font-semibold text-texte-doux">
            {formatTime(conv.updatedAt)}
          </div>
        </div>

        {/* Preview + pastille unread */}
        <div className="mt-[2px] flex items-center justify-between gap-2">
          <div
            className="flex-1 truncate text-[12.5px]"
            style={{
              color: unread ? '#1A1209' : '#7A6A5A',
              fontWeight: unread ? 600 : 500,
            }}
          >
            {conv.lastMessage?.content ?? <span className="italic text-texte-tres-doux">Pas encore de message</span>}
          </div>
          {unread && (
            <span
              className="inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-extrabold text-white"
            >
              {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

/* ── Format heure : 14:32 / hier / lun. / 12 mai ─────────────────────── */
function formatTime(iso: string): string {
  try {
    const d  = new Date(iso)
    const now = new Date()
    const sameDay  = d.toDateString() === now.toDateString()
    if (sameDay) {
      return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    }
    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    if (d.toDateString() === yesterday.toDateString()) return 'hier'

    const diffMs = now.getTime() - d.getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    if (diffDays < 7) {
      return d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '.')
    }
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  } catch {
    return ''
  }
}
