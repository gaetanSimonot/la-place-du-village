'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useFriendships } from '@/hooks/useFriendships'
import { IcChat, IcChev, IcUsers, IcUserPlus, IcEye } from '../icons'

type SubTab = 'amis' | 'suggestions' | 'demandes'

interface PersonRow {
  user_id: string
  display_name: string | null
  avatar_url: string | null
  ville: string | null
}

export default function AmisTab() {
  const { user } = useAuth()
  const { friendProfiles, friendIds, friendships, pendingReceived, sendRequest, accept, cancel, loading } =
    useFriendships()

  const [sub, setSub] = useState<SubTab>('amis')
  const [search, setSearch] = useState('')
  const [suggestions, setSuggestions] = useState<PersonRow[]>([])
  const [suggLoading, setSuggLoading] = useState(false)
  const [pendingActionId, setPendingActionId] = useState<string | null>(null)

  // Tous les user_id avec qui j'ai déjà une relation (amis OU pending) — à exclure des suggestions
  const excludeIds = useMemo(() => {
    if (!user) return new Set<string>()
    const s = new Set<string>([user.id])
    friendIds.forEach(id => s.add(id))
    friendships.forEach(f => {
      if (f.status === 'pending') {
        s.add(f.user1_id)
        s.add(f.user2_id)
      }
    })
    return s
  }, [user, friendIds, friendships])

  // Charge les suggestions : profils publics, hors moi/amis/pending. Pas de scoring V1.
  const loadSuggestions = useCallback(async () => {
    setSuggLoading(true)
    const { data } = await supabase
      .from('profiles_public_listing')
      .select('user_id, display_name, avatar_url, ville')
      .order('display_name', { ascending: true, nullsFirst: false })
      .limit(100)
    const filtered = (data ?? []).filter(p => !excludeIds.has(p.user_id))
    setSuggestions(filtered as PersonRow[])
    setSuggLoading(false)
  }, [excludeIds])

  useEffect(() => {
    if (sub === 'suggestions') loadSuggestions()
  }, [sub, loadSuggestions])

  // Demandes envoyées en attente (par moi)
  const pendingSent = useMemo(() => {
    if (!user) return []
    return friendships
      .filter(f => f.status === 'pending' && f.requested_by === user.id)
      .map(f => {
        const otherId = f.user1_id === user.id ? f.user2_id : f.user1_id
        return { friendship: f, otherId }
      })
  }, [friendships, user])

  // Filtre par recherche locale
  const filterByQ = useCallback((list: PersonRow[]) => {
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      p =>
        (p.display_name ?? '').toLowerCase().includes(q) ||
        (p.ville ?? '').toLowerCase().includes(q),
    )
  }, [search])

  const visibleAmis    = filterByQ(friendProfiles as PersonRow[])
  const visibleSugg    = filterByQ(suggestions)
  const visibleDemReç  = pendingReceived
    .filter(({ profile }) => {
      const q = search.trim().toLowerCase()
      if (!q) return true
      return (
        (profile?.display_name ?? '').toLowerCase().includes(q) ||
        (profile?.ville ?? '').toLowerCase().includes(q)
      )
    })

  async function handleSend(id: string) {
    if (pendingActionId) return
    setPendingActionId(id)
    try {
      await sendRequest(id)
      toast.success('Demande envoyée')
      setSuggestions(s => s.filter(p => p.user_id !== id))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setPendingActionId(null)
    }
  }

  async function handleAccept(friendshipId: string) {
    if (pendingActionId) return
    setPendingActionId(friendshipId)
    try {
      await accept(friendshipId)
      toast.success('Demande acceptée')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setPendingActionId(null)
    }
  }

  async function handleDecline(friendshipId: string) {
    if (pendingActionId) return
    setPendingActionId(friendshipId)
    try {
      await cancel(friendshipId)
      toast.success('Demande déclinée')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setPendingActionId(null)
    }
  }

  return (
    <div className="px-4 pt-4">
      {/* Search bar */}
      <div
        className="flex items-center gap-2.5 rounded-[14px] border bg-white px-3.5 py-[11px]"
        style={{ borderColor: '#E8E0D4', boxShadow: '0 1px 4px rgba(44,28,16,0.04)' }}
      >
        <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="#7A6A5A" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="16.5" y1="16.5" x2="21" y2="21" />
        </svg>
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Chercher un membre du village…"
          className="flex-1 bg-transparent text-[13px] font-medium text-texte placeholder:text-texte-tres-doux focus:outline-none"
        />
      </div>

      {/* Sous-tabs avec compteurs */}
      <div className="mt-[18px] grid grid-cols-3" style={{ borderBottom: '1px solid #F0EAE0' }}>
        <SubTabBtn
          active={sub === 'amis'}
          onClick={() => setSub('amis')}
          label="Mes amis"
          count={friendProfiles.length}
        />
        <SubTabBtn
          active={sub === 'suggestions'}
          onClick={() => setSub('suggestions')}
          label="Suggestions"
          count={suggestions.length}
        />
        <SubTabBtn
          active={sub === 'demandes'}
          onClick={() => setSub('demandes')}
          label="Demandes"
          count={pendingReceived.length}
          alert={pendingReceived.length > 0}
        />
      </div>

      {/* Contenu */}
      <div className="mt-3 flex flex-col gap-2">
        {sub === 'amis' && (
          <>
            {loading && <SkeletonRows />}
            {!loading && visibleAmis.length === 0 && (
              <EmptyState
                icon={<IcUsers size={28} />}
                title={search ? 'Aucun résultat' : 'Aucun ami pour le moment'}
                hint={search ? 'Essaye un autre mot' : 'Découvre des membres dans Suggestions'}
              />
            )}
            {visibleAmis.map(p => (
              <PersonRowAmi key={p.user_id} person={p} />
            ))}
          </>
        )}

        {sub === 'suggestions' && (
          <>
            {suggLoading && <SkeletonRows />}
            {!suggLoading && visibleSugg.length === 0 && (
              <EmptyState
                icon={<IcUserPlus size={28} />}
                title={search ? 'Aucun résultat' : 'Aucune suggestion pour le moment'}
                hint={search ? 'Essaye un autre mot' : 'Reviens plus tard'}
              />
            )}
            {visibleSugg.map(p => (
              <PersonRowSugg
                key={p.user_id}
                person={p}
                disabled={pendingActionId === p.user_id}
                onAdd={() => handleSend(p.user_id)}
              />
            ))}
          </>
        )}

        {sub === 'demandes' && (
          <>
            {visibleDemReç.length > 0 && (
              <>
                <SectionLabel
                  text={`${visibleDemReç.length} personne${visibleDemReç.length > 1 ? 's' : ''} veut${visibleDemReç.length > 1 ? 'ent' : ''} t'ajouter`}
                />
                {visibleDemReç.map(({ friendship, profile }) => (
                  <PersonRowDemReçue
                    key={friendship.id}
                    profile={profile}
                    disabled={pendingActionId === friendship.id}
                    onAccept={() => handleAccept(friendship.id)}
                    onDecline={() => handleDecline(friendship.id)}
                  />
                ))}
              </>
            )}
            {pendingSent.length > 0 && (
              <>
                <SectionLabel text="Tes demandes envoyées" />
                {pendingSent.map(({ friendship, otherId }) => (
                  <PersonRowDemEnvoyee
                    key={friendship.id}
                    otherId={otherId}
                    disabled={pendingActionId === friendship.id}
                    onCancel={() => handleDecline(friendship.id)}
                  />
                ))}
              </>
            )}
            {visibleDemReç.length === 0 && pendingSent.length === 0 && (
              <EmptyState
                icon={<IcEye size={28} />}
                title="Aucune demande en attente"
                hint="Les demandes apparaîtront ici quand elles arrivent"
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}

/* ── Sous-tab bouton ─────────────────────────────────────────────────── */
function SubTabBtn({
  active, onClick, label, count, alert,
}: { active: boolean; onClick: () => void; label: string; count: number; alert?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative inline-flex items-center justify-center gap-1.5 bg-transparent pb-2.5 pt-1 text-[12px] uppercase"
      style={{
        color: active ? '#2D5A3D' : '#7A6A5A',
        fontWeight: active ? 800 : 700,
        letterSpacing: '0.04em',
        borderBottom: active ? '2px solid #2D5A3D' : '2px solid transparent',
        marginBottom: '-1px',
      }}
      aria-pressed={active}
    >
      {label}
      <span
        className="rounded-full px-[7px] py-[1px] text-[10px] font-extrabold"
        style={{
          background: active ? '#E8F2EB' : '#F7F1E6',
          color: active ? '#2D5A3D' : '#7A6A5A',
        }}
      >
        {count}
      </span>
      {alert && (
        <span
          className="absolute -right-1 top-0 block h-1.5 w-1.5 rounded-full"
          style={{ background: '#C84B2F' }}
        />
      )}
    </button>
  )
}

/* ── Row Mes amis : avatar + nom + sub + bouton chat ─────────────────── */
function PersonRowAmi({ person }: { person: PersonRow }) {
  return (
    <div
      className="flex items-center gap-3 rounded-[14px] border bg-white px-3 py-2.5"
      style={{ borderColor: '#F0EAE0' }}
    >
      <Avatar url={person.avatar_url} name={person.display_name} />
      <div className="min-w-0 flex-1">
        <Link
          href={`/profil/${person.user_id}`}
          className="block truncate text-[13px] font-extrabold text-texte no-underline"
          style={{ letterSpacing: '-0.005em' }}
        >
          {person.display_name ?? 'Sans nom'}
        </Link>
        {person.ville && <div className="truncate text-[11px] text-texte-doux">{person.ville}</div>}
      </div>
      <Link
        href={`/messages?friend=${person.user_id}`}
        aria-label="Discuter"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-primary-light text-primary"
      >
        <IcChat size={16} />
      </Link>
    </div>
  )
}

/* ── Row Suggestions : avatar + nom + sub + bouton + Ajouter ─────────── */
function PersonRowSugg({
  person, disabled, onAdd,
}: { person: PersonRow; disabled: boolean; onAdd: () => void }) {
  return (
    <div
      className="flex items-center gap-3 rounded-[14px] border bg-white px-3 py-2.5"
      style={{ borderColor: '#F0EAE0' }}
    >
      <Avatar url={person.avatar_url} name={person.display_name} />
      <Link href={`/profil/${person.user_id}`} className="min-w-0 flex-1 text-inherit no-underline">
        <div className="truncate text-[13px] font-extrabold text-texte" style={{ letterSpacing: '-0.005em' }}>
          {person.display_name ?? 'Sans nom'}
        </div>
        {person.ville && <div className="truncate text-[11px] text-texte-doux">{person.ville}</div>}
      </Link>
      <button
        type="button"
        onClick={onAdd}
        disabled={disabled}
        className="shrink-0 rounded-full bg-primary px-3.5 py-1.5 text-[12px] font-extrabold text-white disabled:opacity-60"
      >
        + Ajouter
      </button>
    </div>
  )
}

/* ── Row Demande reçue : 2 boutons (Accepter / Décliner) ─────────────── */
function PersonRowDemReçue({
  profile, disabled, onAccept, onDecline,
}: {
  profile: PersonRow | undefined
  disabled: boolean
  onAccept: () => void
  onDecline: () => void
}) {
  if (!profile) return null
  return (
    <div
      className="flex flex-col gap-3 rounded-[14px] border bg-white px-3 py-3"
      style={{ borderColor: '#F0EAE0' }}
    >
      <div className="flex items-center gap-3">
        <Avatar url={profile.avatar_url} name={profile.display_name} size={48} />
        <Link href={`/profil/${profile.user_id}`} className="min-w-0 flex-1 text-inherit no-underline">
          <div className="truncate text-[14px] font-extrabold text-texte" style={{ letterSpacing: '-0.005em' }}>
            {profile.display_name ?? 'Sans nom'}
          </div>
          {profile.ville && <div className="truncate text-[11px] text-texte-doux">{profile.ville}</div>}
        </Link>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onAccept}
          disabled={disabled}
          className="flex-1 rounded-[11px] bg-primary py-2 text-[13px] font-extrabold text-white disabled:opacity-60"
        >
          Accepter
        </button>
        <button
          type="button"
          onClick={onDecline}
          disabled={disabled}
          className="flex-1 rounded-[11px] border bg-white py-2 text-[13px] font-bold text-texte disabled:opacity-60"
          style={{ borderColor: '#E8E0D4' }}
        >
          Décliner
        </button>
      </div>
    </div>
  )
}

/* ── Row Demande envoyée : juste annuler ─────────────────────────────── */
function PersonRowDemEnvoyee({
  otherId, disabled, onCancel,
}: { otherId: string; disabled: boolean; onCancel: () => void }) {
  return (
    <div
      className="flex items-center gap-3 rounded-[14px] border bg-white px-3 py-2.5"
      style={{ borderColor: '#F0EAE0' }}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-light text-[14px] font-extrabold text-primary">
        ·
      </div>
      <Link href={`/profil/${otherId}`} className="min-w-0 flex-1 text-inherit no-underline">
        <div className="text-[12px] italic text-texte-doux">Envoyée — en attente</div>
      </Link>
      <button
        type="button"
        onClick={onCancel}
        disabled={disabled}
        className="shrink-0 rounded-full px-3 py-1.5 text-[11.5px] font-bold text-texte-doux disabled:opacity-60"
      >
        Annuler
      </button>
    </div>
  )
}

/* ── Avatar simple ───────────────────────────────────────────────────── */
function Avatar({ url, name, size = 42 }: { url: string | null; name: string | null; size?: number }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  const initial = (name ?? '·').trim().charAt(0).toUpperCase() || '·'
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-primary font-serif text-white"
      style={{ width: size, height: size, fontSize: size * 0.42, lineHeight: 1 }}
    >
      {initial}
    </div>
  )
}

/* ── État vide ───────────────────────────────────────────────────────── */
function EmptyState({
  icon, title, hint,
}: { icon: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary-light text-primary">
        {icon}
      </div>
      <div className="text-[14px] font-extrabold text-texte">{title}</div>
      {hint && <div className="mt-1 text-[12px] text-texte-doux">{hint}</div>}
    </div>
  )
}

/* ── Skeleton ────────────────────────────────────────────────────────── */
function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-[14px] border bg-white px-3 py-2.5"
          style={{ borderColor: '#F0EAE0' }}
        >
          <div className="h-[42px] w-[42px] shrink-0 animate-pulse rounded-full bg-cremeDeep" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-2/3 animate-pulse rounded bg-cremeDeep" />
            <div className="h-2.5 w-1/3 animate-pulse rounded bg-cremeDeep" />
          </div>
        </div>
      ))}
    </>
  )
}

/* ── Section label ─────────────────────────────────────────────────── */
function SectionLabel({ text }: { text: string }) {
  return (
    <div
      className="mt-2 text-[11px] font-extrabold uppercase text-texte-doux"
      style={{ letterSpacing: '0.06em' }}
    >
      {text}
    </div>
  )
}
