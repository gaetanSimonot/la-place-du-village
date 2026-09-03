'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import BottomNavBar from '@/components/BottomNavBar'
import PersonCard, { type PersonCardData } from '@/components/PersonCard'
import { useFriendships } from '@/hooks/useFriendships'
import { authedFetcher } from '@/lib/swr-fetchers'

type Filter = 'all' | 'friends'

export default function PeopleClient() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [search, setSearch]     = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filter, setFilter]     = useState<Filter>('all')
  const { statusWith, friendProfiles, pendingReceived, sendRequest, accept, cancel } = useFriendships()

  // Guard auth : /people réservé aux users connectés
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/profil')
    }
  }, [authLoading, user, router])

  // Debounce sur search (250ms) — évite de saturer le serveur à chaque keystroke
  useEffect(() => {
    const t = setTimeout(() => {
      const q = search.trim()
      // q.length === 1 → on ne change pas debouncedSearch (évite trop de matches)
      if (q.length === 0 || q.length >= 2) setDebouncedSearch(q)
    }, 250)
    return () => clearTimeout(t)
  }, [search])

  // SWR + authedFetcher — clé null tant que la session n'est pas prête.
  // Inclut la query dans la clé → cache par recherche, retour instantané.
  const peopleKey = !authLoading && user
    ? `/api/people${debouncedSearch ? `?q=${encodeURIComponent(debouncedSearch)}` : ''}`
    : null
  const { data, isLoading, mutate } = useSWR<{ people: PersonCardData[]; total?: number }>(peopleKey, authedFetcher)
  const people = useMemo<PersonCardData[]>(() => data?.people ?? [], [data])
  const apiTotal = data?.total ?? 0
  const loading = (isLoading && !data) ? true : false

  // Compteur "live" : fetch direct Supabase au mount pour bypass SWR et
  // Service Worker. Source unique de vérité = count exact de la table
  // profiles, identique à /admin/membres. Si la query échoue (RLS, réseau),
  // on tombe back sur le `total` retourné par l'API. Aucun cache local.
  const [liveTotal, setLiveTotal] = useState<number | null>(null)
  useEffect(() => {
    if (!user) return
    let alive = true
    supabase
      .from('profiles')
      // `user_id` et non `*` : c'est un comptage, inutile de demander des
      // colonnes que la clé publique n'a plus le droit de lire.
      .select('user_id', { count: 'exact', head: true })
      .then(({ count, error }) => {
        if (!alive) return
        if (!error && typeof count === 'number') setLiveTotal(count)
      })
    return () => { alive = false }
  }, [user])
  const total = liveTotal ?? apiTotal

  // Realtime sur profiles : mutate() invalide la clé courante → refetch
  useEffect(() => {
    if (!peopleKey) return
    const ch = supabase
      .channel('people-profiles-watch')
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'profiles' }, () => mutate())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, () => mutate())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [peopleKey, mutate])

  const visible = useMemo(() => {
    // Filtre "Mes amis" : on prend la liste des amis depuis le hook + filter par search
    if (filter === 'friends') {
      const q = search.trim().toLowerCase()
      const arr = friendProfiles as PersonCardData[]
      if (!q) return arr
      return arr.filter(p =>
        (p.display_name ?? '').toLowerCase().includes(q) ||
        (p.ville ?? '').toLowerCase().includes(q),
      )
    }
    return people
  }, [people, filter, friendProfiles, search])

  // Non loggé → spinner pendant la redirect (useEffect ci-dessus)
  if (authLoading || !user) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-creme">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-bord border-t-primary" />
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
            Les gens
          </div>
          <div className="mt-0.5 text-[10.5px] font-medium text-texte-doux">
            {loading
              ? '…'
              : filter === 'friends'
                ? `${visible.length} ami${visible.length > 1 ? 's' : ''}`
                : `${total} membre${total > 1 ? 's' : ''}`}
          </div>
        </div>
        <div className="h-10 w-10 shrink-0" /> {/* spacer pour centrer le titre */}
      </div>

      {/* ─── Recherche ──────────────────────────────────── */}
      <div className="px-4 pt-3">
        <div className="flex items-center gap-2 rounded-xl border border-bord bg-white px-3 py-2.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7A6A5A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un nom ou une ville…"
            className="min-w-0 flex-1 border-none bg-transparent text-[14px] text-texte outline-none placeholder:text-texte-tres-doux"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label="Effacer"
              className="shrink-0 text-texte-tres-doux text-[14px]"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ─── Demandes reçues (visible en haut tant qu'il y en a) ─── */}
      {pendingReceived.length > 0 && (
        <div className="mx-4 mt-3 rounded-2xl border border-primary-light bg-primary-light/30 p-3">
          <p className="m-0 mb-2 text-[11px] font-extrabold uppercase tracking-[0.08em] text-primary">
            {pendingReceived.length} demande{pendingReceived.length > 1 ? 's' : ''} d&apos;ami{pendingReceived.length > 1 ? 's' : ''} reçue{pendingReceived.length > 1 ? 's' : ''}
          </p>
          <div className="space-y-2">
            {pendingReceived.map(({ friendship, profile }) => (
              <div key={friendship.id} className="flex items-center gap-3 rounded-xl bg-white p-2.5">
                {profile?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatar_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-[16px] font-bold text-white">
                    {(profile?.display_name || '?')[0].toUpperCase()}
                  </div>
                )}
                <Link href={`/profil/${friendship.user1_id === friendship.requested_by ? friendship.user1_id : friendship.user2_id}`} className="min-w-0 flex-1 no-underline">
                  <div className="truncate text-[13px] font-bold text-texte">{profile?.display_name ?? 'Membre'}</div>
                  {profile?.ville && <div className="truncate text-[11px] text-texte-doux">{profile.ville}</div>}
                </Link>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    onClick={() => accept(friendship.id)}
                    className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-[11px] font-bold text-white"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    Accepter
                  </button>
                  <button
                    onClick={() => cancel(friendship.id)}
                    className="inline-flex items-center gap-1 rounded-full border border-bord bg-white px-3 py-1.5 text-[11px] font-bold text-texte-doux"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                    Refuser
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Filtres (chips) ────────────────────────────── */}
      <div className="flex gap-1.5 px-4 pt-3">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`rounded-full border px-3 py-1.5 text-[12px] font-bold transition-colors ${
            filter === 'all' ? 'border-primary bg-primary text-white' : 'border-bord bg-white text-texte'
          }`}
        >
          Tous
        </button>
        <button
          type="button"
          onClick={() => setFilter('friends')}
          className={`rounded-full border px-3 py-1.5 text-[12px] font-bold transition-colors ${
            filter === 'friends' ? 'border-primary bg-primary text-white' : 'border-bord bg-white text-texte'
          }`}
        >
          Mes amis
          {friendProfiles.length > 0 && (
            <span className={`ml-1 text-[10px] font-extrabold ${filter === 'friends' ? 'opacity-80' : 'text-texte-doux'}`}>
              ({friendProfiles.length})
            </span>
          )}
        </button>
      </div>

      {/* ─── Liste ──────────────────────────────────────── */}
      <div className="mt-3 flex flex-col gap-2 px-4">
        {loading && people.length === 0 && (
          <p className="py-6 text-center text-[12px] text-texte-doux">Chargement…</p>
        )}
        {!loading && visible.length === 0 && filter === 'all' && (
          <div className="rounded-2xl border border-bordSoft bg-white p-6 text-center">
            <p className="m-0 mb-1 text-[14px] font-bold text-texte">
              {search.trim() ? 'Aucun résultat' : 'Aucun membre public pour l\'instant'}
            </p>
            <p className="m-0 text-[12px] text-texte-doux">
              {search.trim() ? 'Essaie un autre nom ou ville.' : 'Reviens plus tard.'}
            </p>
          </div>
        )}
        {!loading && visible.length === 0 && filter === 'friends' && (
          <div className="rounded-2xl border border-bordSoft bg-white p-6 text-center">
            <p className="m-0 mb-1 text-[14px] font-bold text-texte">
              {search.trim() ? 'Aucun ami ne correspond' : 'Tu n\'as encore aucun ami'}
            </p>
            <p className="m-0 text-[12px] text-texte-doux">
              {search.trim()
                ? 'Essaie un autre nom ou ville.'
                : 'Va dans l\'onglet « Tous » pour ajouter des amis.'}
            </p>
          </div>
        )}
        {visible.map(p => (
          <PersonCard
            key={p.user_id}
            p={p}
            friend={{
              state:         statusWith(p.user_id),
              onSendRequest: sendRequest,
              onAccept:      accept,
              onCancel:      cancel,
            }}
          />
        ))}
      </div>

      <BottomNavBar />
    </main>
  )
}
