'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import BottomNavBar from '@/components/BottomNavBar'
import type { Covoiturage } from '@/lib/covoiturage'

type CovoitWithProf = Covoiturage & {
  conducteur: { display_name: string | null; avatar_url: string | null } | null
}

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
  if (d.getTime() === today.getTime())    return "Aujourd'hui"
  if (d.getTime() === tomorrow.getTime()) return 'Demain'
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
}

function Avatar({ name, url, size = 32 }: { name: string; url?: string | null; size?: number }) {
  if (url) return <img src={url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', backgroundColor: '#2D5A3D',
      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.4, flexShrink: 0,
    }}>{(name || '?')[0].toUpperCase()}</div>
  )
}

export default function CovoiturageListClient() {
  const { user } = useAuth()
  const { openAuthModal } = useAuthModal()
  const [covoits, setCovoits] = useState<CovoitWithProf[]>([])
  const [loading, setLoading] = useState(true)
  const [depart, setDepart] = useState('')
  const [destination, setDestination] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (depart) params.set('depart', depart)
    if (destination) params.set('destination', destination)
    const res = await fetch(`/api/covoiturages?${params.toString()}`)
    const data = await res.json()
    setCovoits(data.covoiturages ?? [])
    setLoading(false)
  }, [depart, destination])

  useEffect(() => { load() }, [load])

  // Realtime sur covoiturages — channel unique par instance pour eviter les
  // conflits "cannot add postgres_changes callbacks after subscribe()"
  useEffect(() => {
    const id = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
    const ch = supabase
      .channel(`covoit-list-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'covoiturages' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  const handleProposer = () => {
    if (!user) { openAuthModal('/covoiturage/nouveau'); return }
    window.location.href = '/covoiturage/nouveau'
  }

  return (
    <main className="min-h-[100dvh] bg-creme pb-28 font-inter text-texte">
      {/* Top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between gap-2.5 border-b border-bordSoft bg-creme/95 px-4 py-3 backdrop-blur">
        <Link
          href="/"
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
            Covoiturage
          </div>
          <div className="mt-0.5 text-[10.5px] font-medium text-texte-doux">
            Service gratuit · entre voisins
          </div>
        </div>
        <Link
          href="/covoiturage/mes-conversations"
          aria-label="Mes conversations"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-bord bg-white text-texte"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
          </svg>
        </Link>
      </div>

      {/* Filtres */}
      <div className="px-4 pt-4">
        <div className="rounded-2xl border border-bord bg-white p-3 shadow-[0_1px_4px_rgba(44,28,16,0.04)]">
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-xl bg-cremeDeep px-3 py-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7A6A5A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33"/>
              </svg>
              <input
                value={depart}
                onChange={e => setDepart(e.target.value)}
                placeholder="Départ"
                className="flex-1 border-none bg-transparent text-[13px] text-texte outline-none placeholder:text-texte-tres-doux"
              />
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7A6A5A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"/>
              <polyline points="13 6 19 12 13 18"/>
            </svg>
            <div className="flex flex-1 items-center gap-2 rounded-xl bg-cremeDeep px-3 py-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7A6A5A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s-7-7.5-7-12a7 7 0 0 1 14 0c0 4.5-7 12-7 12z"/>
                <circle cx="12" cy="10" r="2.5"/>
              </svg>
              <input
                value={destination}
                onChange={e => setDestination(e.target.value)}
                placeholder="Destination"
                className="flex-1 border-none bg-transparent text-[13px] text-texte outline-none placeholder:text-texte-tres-doux"
              />
            </div>
          </div>
        </div>
      </div>

      {/* CTA Proposer un trajet */}
      <div className="px-4 pt-3">
        <button
          type="button"
          onClick={handleProposer}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-[14px] font-bold text-white"
          style={{ boxShadow: '0 4px 14px rgba(45,90,61,0.25)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Proposer un trajet
        </button>
      </div>

      {/* Liste */}
      <div className="mt-5 flex flex-col gap-2 px-4">
        {loading && <p className="py-6 text-center text-[12px] text-texte-doux">Chargement…</p>}
        {!loading && covoits.length === 0 && (
          <div className="rounded-2xl border border-bordSoft bg-white p-6 text-center">
            <p className="m-0 mb-1 text-[14px] font-bold text-texte">Aucun trajet pour le moment</p>
            <p className="m-0 text-[12px] text-texte-doux">
              Sois le premier à en proposer un. C&apos;est gratuit, c&apos;est sympa.
            </p>
          </div>
        )}
        {!loading && covoits.map(c => (
          <Link
            key={c.id}
            href={`/covoiturage/${c.id}`}
            className="block rounded-2xl border border-bord bg-white p-3.5 no-underline"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-primary">
                  {fmtDate(c.date_trajet)}
                </span>
                {c.heure_depart && (
                  <span className="text-[10px] font-bold text-texte-doux">{c.heure_depart}</span>
                )}
              </div>
              <span
                className="rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase"
                style={{
                  background: c.statut === 'complet' ? '#FFF0E5' : '#E8F2EB',
                  color:      c.statut === 'complet' ? '#C84B2F' : '#2D5A3D',
                }}
              >
                {c.statut === 'complet' ? 'Complet' : `${c.places - c.places_prises} place${c.places - c.places_prises > 1 ? 's' : ''}`}
              </span>
            </div>
            <div className="mt-2 flex min-w-0 items-center gap-2 text-[14px] font-bold text-texte">
              <span className="min-w-0 flex-1 truncate">{c.depart}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7A6A5A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="13 6 19 12 13 18"/>
              </svg>
              <span className="min-w-0 flex-1 truncate">{c.destination}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Avatar
                  name={c.conducteur?.display_name ?? 'Conducteur'}
                  url={c.conducteur?.avatar_url}
                  size={26}
                />
                <span className="text-[11px] text-texte-doux">
                  {c.conducteur?.display_name ?? 'Conducteur'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                {!c.fumeur  && <span title="Non-fumeur"        className="opacity-60">🚭</span>}
                {c.animaux  && <span title="Animaux acceptés"  className="opacity-60">🐶</span>}
                {c.bagages  && <span title="Bagages acceptés"  className="opacity-60">🎒</span>}
                <span className="ml-1 rounded-md bg-cremeDeep px-2 py-0.5 font-bold text-texte">
                  {c.prix > 0 ? `${c.prix.toFixed(2).replace(/\.00$/, '')} €` : 'Gratuit'}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <BottomNavBar />
    </main>
  )
}
