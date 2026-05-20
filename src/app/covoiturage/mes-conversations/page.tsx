'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import BottomNavBar from '@/components/BottomNavBar'

interface ConvEnriched {
  id: string
  covoit_id: string
  candidat_id: string
  conducteur_id: string
  statut: 'open' | 'validee' | 'refusee' | 'closed'
  role: 'conducteur' | 'candidat'
  other: { user_id: string; display_name: string | null; avatar_url: string | null } | null
  covoit: { id: string; depart: string; destination: string; date_trajet: string; heure_depart: string | null; prix: number; statut: string } | null
  last_message: { content: string; created_at: string } | null
  unread_count: number
  updated_at: string
}

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return "à l'instant"
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}j`
}

function Avatar({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) {
  if (url) return <img src={url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', backgroundColor: '#2D5A3D',
      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.4, flexShrink: 0,
    }}>{(name || '?')[0].toUpperCase()}</div>
  )
}

export default function MesCovoitConversationsPage() {
  const { user, loading: authLoading } = useAuth()
  const { openAuthModal } = useAuthModal()
  const [convs, setConvs] = useState<ConvEnriched[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!authLoading && !user) openAuthModal('/covoiturage/mes-conversations')
  }, [authLoading, user, openAuthModal])

  const load = useCallback(async () => {
    if (!user) return
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return
    const res = await fetch('/api/covoiturages/conversations', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const d = await res.json()
    setConvs(d.conversations ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!user) return
    const id = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
    const ch = supabase
      .channel(`covoit-conv-list-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'covoit_conversations' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'covoit_messages' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load, user])

  return (
    <main className="min-h-[100dvh] bg-creme pb-28 font-inter text-texte">
      {/* Top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between gap-2.5 border-b border-bordSoft bg-creme/95 px-4 py-3 backdrop-blur">
        <Link
          href="/covoiturage"
          aria-label="Retour"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-bord bg-white text-texte"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
          </svg>
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <div className="font-serif text-[17px] leading-none text-texte" style={{ letterSpacing: '-0.01em' }}>
            Mes conversations covoit
          </div>
        </div>
        <div className="w-10" />
      </div>

      <div className="flex flex-col gap-2 px-4 pt-4">
        {loading && <p className="py-6 text-center text-[12px] text-texte-doux">Chargement…</p>}
        {!loading && convs.length === 0 && (
          <div className="rounded-2xl border border-bordSoft bg-white p-6 text-center">
            <p className="m-0 mb-1 text-[14px] font-bold text-texte">Aucune conversation</p>
            <p className="m-0 text-[12px] text-texte-doux">
              Tes échanges avec les conducteurs et candidats apparaîtront ici.
            </p>
          </div>
        )}
        {!loading && convs.map(c => (
          <Link
            key={c.id}
            href={`/covoiturage/conversations/${c.id}`}
            className="block rounded-2xl border border-bord bg-white p-3 no-underline"
          >
            <div className="flex items-center gap-3">
              <Avatar
                name={c.other?.display_name ?? '?'}
                url={c.other?.avatar_url}
                size={44}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-bold text-texte">
                    {c.other?.display_name ?? 'Utilisateur'}
                  </span>
                  <span className="shrink-0 text-[10px] text-texte-tres-doux">
                    {c.last_message ? timeAgo(c.last_message.created_at) : ''}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-texte-doux">
                  <span
                    className="rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.06em]"
                    style={{
                      background: c.role === 'conducteur' ? '#E8F2EB' : '#EEF3FF',
                      color:      c.role === 'conducteur' ? '#2D5A3D' : '#3A5BC7',
                    }}
                  >
                    {c.role === 'conducteur' ? 'Vous conduisez' : 'Vous candidatez'}
                  </span>
                  {c.statut === 'validee' && (
                    <span className="text-[10px] font-bold text-primary">✓ validée</span>
                  )}
                  {c.statut === 'refusee' && (
                    <span className="text-[10px] font-bold text-accent">refusée</span>
                  )}
                  {c.statut === 'closed' && (
                    <span className="text-[10px] font-bold text-texte-tres-doux">fermée</span>
                  )}
                </div>
                <div className="mt-1 line-clamp-1 text-[12px] text-texte-doux">
                  {c.covoit && (
                    <span className="font-bold text-texte">
                      {c.covoit.depart} → {c.covoit.destination} ·{' '}
                    </span>
                  )}
                  {c.last_message ? c.last_message.content : 'Pas encore de message'}
                </div>
              </div>
              {c.unread_count > 0 && (
                <span className="flex h-6 min-w-[24px] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-extrabold text-white">
                  {c.unread_count}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>

      <BottomNavBar />
    </main>
  )
}
