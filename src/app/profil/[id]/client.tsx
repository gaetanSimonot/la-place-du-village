'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

interface FullProfile {
  id: string
  display_name: string | null
  avatar_url: string | null
  email: string | null
  bio: string | null
  ville: string | null
  plan: string | null
  created_at?: string | null
}

interface AnnonceSnippet {
  id: string
  titre: string
  type: 'vente' | 'don' | 'troc' | 'enchere_inversee'
  photos: string[] | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prix: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prix_initial: any
  statut: string
}

interface EventSnippet {
  id: string; titre: string; date_debut: string | null
  image_url: string | null; categorie: string
}

interface MiniProfile {
  id: string
  display_name: string | null
  avatar_url: string | null
}

interface VendeurStats {
  note_moyenne: number | null
  notes_count: number
}

type Tab = 'annonces' | 'events' | 'abos'

function memberSinceLabel(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

function Avatar({ name, url, size = 96 }: { name: string; url?: string | null; size?: number }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className="rounded-full object-cover"
        style={{
          width: size, height: size,
          border: '4px solid #E8F2EB',
          boxShadow: '0 4px 16px rgba(44,28,16,0.10)',
        }}
      />
    )
  }
  return (
    <div
      className="flex items-center justify-center rounded-full bg-primary font-extrabold text-white"
      style={{
        width: size, height: size,
        fontSize: Math.round(size * 0.38),
        border: '4px solid #E8F2EB',
        boxShadow: '0 4px 16px rgba(44,28,16,0.10)',
      }}
    >
      {(name[0] ?? '?').toUpperCase()}
    </div>
  )
}

const TYPE_PALETTE: Record<AnnonceSnippet['type'], { label: string; bg: string }> = {
  vente:            { label: 'VENTE',   bg: '#1A1209' },
  don:              { label: 'DON',     bg: '#2D5A3D' },
  troc:             { label: 'TROC',    bg: '#3A5D8C' },
  enchere_inversee: { label: 'ENCHÈRE', bg: '#C84B2F' },
}

function getPrixLabel(a: AnnonceSnippet): { value: string; color?: string } {
  if (a.type === 'don') return { value: 'Gratuit', color: '#2D5A3D' }
  if (a.type === 'troc') return { value: 'Échange', color: '#3A5D8C' }
  if (a.type === 'enchere_inversee') {
    const p = typeof a.prix === 'number' ? a.prix : null
    return { value: p != null ? `${p} €` : '—', color: '#C84B2F' }
  }
  const p = typeof a.prix === 'number' ? a.prix : null
  return { value: p != null ? `${p} €` : '—' }
}

export default function ProfilPageClient({ id }: { id: string }) {
  const router = useRouter()
  const { user } = useAuth()

  const [profile, setProfile]               = useState<FullProfile | null>(null)
  const [loading, setLoading]               = useState(true)
  const [followerCount, setFollowerCount]   = useState(0)
  const [, setFollowingCount]               = useState(0)
  const [isFollowing, setIsFollowing]       = useState(false)
  const [followLoading, setFollowLoading]   = useState(false)
  const [annonces, setAnnonces]             = useState<AnnonceSnippet[]>([])
  const [annonceCount, setAnnonceCount]     = useState<number>(0)
  const [events, setEvents]                 = useState<EventSnippet[]>([])
  const [followings, setFollowings]         = useState<MiniProfile[]>([])
  const [stats, setStats]                   = useState<VendeurStats | null>(null)

  const [editing, setEditing]               = useState(false)
  const [editName, setEditName]             = useState('')
  const [editBio, setEditBio]               = useState('')
  const [editVille, setEditVille]           = useState('')
  const [saving, setSaving]                 = useState(false)
  const [uploadError, setUploadError]       = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const [tab, setTab] = useState<Tab>('annonces')

  const isOwn = user?.id === id

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [
          { data: p },
          { count: fc },
          { count: ing },
          { count: annCount },
          { data: vstats },
        ] = await Promise.all([
          supabase.from('profiles').select('*').eq('user_id', id).single(),
          supabase.from('follows').select('*', { count: 'exact', head: true }).eq('followed_id', id),
          supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', id),
          supabase.from('annonces').select('*', { count: 'exact', head: true }).eq('user_id', id).in('statut', ['active', 'don_final', 'vendu']),
          supabase.from('vendeur_stats').select('note_moyenne, notes_count').eq('user_id', id).maybeSingle(),
        ])
        if (p) setProfile({ ...p, id } as FullProfile)
        setFollowerCount(fc ?? 0)
        setFollowingCount(ing ?? 0)
        setAnnonceCount(annCount ?? 0)
        setStats(vstats as VendeurStats | null)

        if (user) {
          const { data: f } = await supabase.from('follows')
            .select('follower_id').eq('follower_id', user.id).eq('followed_id', id).maybeSingle()
          setIsFollowing(!!f)
        }

        // Annonces du profil
        const { data: annRows } = await supabase
          .from('annonces')
          .select('id, titre, type, photos, prix, prix_initial, statut')
          .eq('user_id', id)
          .in('statut', ['active', 'don_final', 'vendu'])
          .order('created_at', { ascending: false })
          .limit(12)
        setAnnonces((annRows ?? []) as AnnonceSnippet[])

        // Événements suivis (interests)
        const { data: interests } = await supabase
          .from('interests')
          .select('evenements(id, titre, date_debut, image_url, categorie)')
          .eq('user_id', id)
          .order('created_at', { ascending: false })
          .limit(12)
        setEvents(((interests ?? []) as unknown as { evenements: EventSnippet | null }[])
          .map(i => i.evenements).filter((e): e is EventSnippet => e !== null))

        // Personnes suivies
        const { data: rawFollowing } = await supabase
          .from('follows')
          .select('followed_id')
          .eq('follower_id', id)
          .limit(20)
        if (rawFollowing && rawFollowing.length > 0) {
          const ids = rawFollowing.map((f: { followed_id: string }) => f.followed_id)
          const { data: followingProfiles } = await supabase
            .from('profiles')
            .select('user_id, display_name, avatar_url')
            .in('user_id', ids)
          setFollowings(((followingProfiles ?? []) as { user_id: string; display_name: string | null; avatar_url: string | null }[])
            .map(p => ({ id: p.user_id, display_name: p.display_name, avatar_url: p.avatar_url })))
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id, user])

  const handleFollow = async () => {
    if (!user) return
    setFollowLoading(true)
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', user.id).eq('followed_id', id)
      setIsFollowing(false); setFollowerCount(p => Math.max(0, p - 1))
    } else {
      await supabase.from('follows').insert({ follower_id: user.id, followed_id: id })
      setIsFollowing(true); setFollowerCount(p => p + 1)
    }
    setFollowLoading(false)
  }

  const startEdit = () => {
    setEditName(profile?.display_name ?? '')
    setEditBio(profile?.bio ?? '')
    setEditVille(profile?.ville ?? '')
    setEditing(true)
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setUploadError('')
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${user.id}/avatar.${ext}`
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (error) { setUploadError('Erreur upload — vérifie le bucket "avatars" dans Supabase Storage'); return }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('user_id', user.id)
    setProfile(p => p ? { ...p, avatar_url: publicUrl } : p)
  }

  const saveEdit = async () => {
    if (!user || saving) return
    setSaving(true)
    const { error } = await supabase.from('profiles').update({
      display_name: editName.trim() || null,
      bio: editBio.trim() || null,
      ville: editVille.trim() || null,
    }).eq('user_id', user.id)
    if (!error) {
      setProfile(p => p ? { ...p, display_name: editName.trim() || null, bio: editBio.trim() || null, ville: editVille.trim() || null } : p)
      setEditing(false)
    }
    setSaving(false)
  }

  const handleShare = async () => {
    const url = window.location.href
    if (navigator.share) {
      try { await navigator.share({ title: profile?.display_name ?? 'Profil', url }) } catch {}
    } else {
      await navigator.clipboard.writeText(url).catch(() => {})
    }
  }

  const name = useMemo(() => profile?.display_name || profile?.email?.split('@')[0] || 'Anonyme', [profile])

  if (loading) return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-creme">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-bord border-t-primary" />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  if (!profile) return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-creme font-inter">
      <p className="text-texte-doux">Profil introuvable</p>
    </div>
  )

  return (
    <div className="min-h-[100dvh] bg-creme pb-10 font-inter text-texte">
      <style>{`@keyframes spin { to { transform: rotate(360deg) } } .pdv-hscroll { scrollbar-width: none } .pdv-hscroll::-webkit-scrollbar { display: none }`}</style>

      {/* Top bar V3 */}
      <div className="flex items-center justify-between gap-2.5 px-4 pt-3.5">
        <button
          onClick={() => router.back()}
          aria-label="Retour"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-bord bg-white text-texte shadow-[0_1px_2px_rgba(44,28,16,0.04)]"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <div className="flex-1 truncate text-center text-[14px] font-bold text-texte">{name}</div>
        <button
          onClick={handleShare}
          aria-label="Partager"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-bord bg-white text-texte shadow-[0_1px_2px_rgba(44,28,16,0.04)]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
            <polyline points="16 6 12 2 8 6"/>
            <line x1="12" y1="2" x2="12" y2="15"/>
          </svg>
        </button>
      </div>

      {/* Hero centered */}
      <div className="flex flex-col items-center px-4 pt-6 text-center">
        <div className="relative">
          <Avatar name={name} url={profile.avatar_url} size={96} />
          {isOwn && editing && (
            <>
              <button
                onClick={() => fileRef.current?.click()}
                aria-label="Changer la photo"
                className="absolute -bottom-0 -right-0 flex h-[30px] w-[30px] items-center justify-center rounded-full border-[3px] border-white bg-primary text-white"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              </button>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
            </>
          )}
        </div>

        {!editing ? (
          <h1
            className="m-0 mt-3.5 font-serif text-[26px] font-normal text-texte"
            style={{ letterSpacing: '-0.02em' }}
          >
            {name}
          </h1>
        ) : (
          <input
            value={editName}
            onChange={e => setEditName(e.target.value)}
            placeholder="Prénom ou pseudo"
            className="mt-3 w-full max-w-[280px] rounded-xl border-[1.5px] border-bord bg-white px-3 py-2 text-center font-serif text-[22px] outline-none focus:border-primary"
          />
        )}

        {(profile.ville || profile.created_at) && !editing && (
          <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-texte-doux">
            {profile.ville && (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s-7-7.5-7-12a7 7 0 0 1 14 0c0 4.5-7 12-7 12z"/>
                  <circle cx="12" cy="10" r="2.5"/>
                </svg>
                <span>{profile.ville}</span>
              </>
            )}
            {profile.ville && profile.created_at && <span>·</span>}
            {profile.created_at && (
              <span>Membre depuis {memberSinceLabel(profile.created_at)}</span>
            )}
          </div>
        )}

        {editing && (
          <input
            value={editVille}
            onChange={e => setEditVille(e.target.value)}
            placeholder="Ta ville"
            className="mt-2 w-full max-w-[280px] rounded-xl border-[1.5px] border-bord bg-white px-3 py-2 text-center text-[13px] outline-none focus:border-primary"
          />
        )}

        {!editing && profile.bio && (
          <p className="m-0 mt-3 max-w-[320px] px-2 text-[13px] leading-[1.5] text-texte">
            {profile.bio}
          </p>
        )}
        {editing && (
          <textarea
            value={editBio}
            onChange={e => setEditBio(e.target.value)}
            placeholder="Quelques mots sur toi…"
            rows={3}
            className="mt-3 w-full max-w-[320px] resize-none rounded-xl border-[1.5px] border-bord bg-white px-3 py-2 text-[13px] outline-none focus:border-primary"
          />
        )}
        {uploadError && <p className="mt-2 text-[12px] text-accent">{uploadError}</p>}
      </div>

      {/* Stats card */}
      <div className="px-4 pt-[18px]">
        <div
          className="flex items-stretch rounded-2xl border bg-white py-3 shadow-[0_1px_4px_rgba(44,28,16,0.04)]"
          style={{ borderColor: '#F0EAE0' }}
        >
          <Stat value={annonceCount} label="Annonces" />
          <Divider />
          <Stat value={followerCount} label="Abonnés" />
          <Divider />
          <Stat
            value={stats?.note_moyenne != null ? stats.note_moyenne.toFixed(1).replace('.', ',') : '—'}
            label="Note"
            iconRight={stats?.note_moyenne != null ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="#D4A93C">
                <polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9"/>
              </svg>
            ) : undefined}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 px-4 pt-[18px]">
        {isOwn ? (
          editing ? (
            <>
              <button
                onClick={() => setEditing(false)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-bord bg-white px-3 py-3 text-[13px] font-bold text-texte"
              >
                Annuler
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border-none bg-primary px-3 py-3 text-[13px] font-bold text-white disabled:opacity-60"
              >
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </>
          ) : (
            <button
              onClick={startEdit}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-bord bg-white px-3 py-3 text-[13px] font-bold text-texte"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
              </svg>
              Modifier mon profil
            </button>
          )
        ) : (
          <>
            <button
              onClick={handleFollow}
              disabled={followLoading || !user}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-2xl px-3 py-3 text-[13px] font-bold disabled:opacity-60 ${
                isFollowing
                  ? 'border border-bord bg-white text-texte'
                  : 'border-none bg-primary text-white'
              }`}
            >
              {isFollowing ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  Abonné
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="20" y1="8" x2="20" y2="14"/>
                    <line x1="23" y1="11" x2="17" y2="11"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
                  </svg>
                  S&apos;abonner
                </>
              )}
            </button>
          </>
        )}
      </div>

      {/* Tabs */}
      {!editing && (
        <div className="mx-4 mt-[22px] flex gap-0 border-b" style={{ borderColor: '#F0EAE0' }}>
          {([
            { id: 'annonces' as Tab, label: 'Annonces',    count: annonceCount },
            { id: 'events' as Tab,   label: 'Événements',  count: events.length },
            { id: 'abos' as Tab,     label: 'Abonnements', count: followings.length },
          ]).map(t => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex flex-1 items-center justify-center gap-1.5 bg-transparent py-2.5 text-[12px] font-extrabold uppercase tracking-[0.04em] ${
                  active ? 'text-primary' : 'text-texte-doux'
                }`}
                style={{
                  borderBottom: active ? '2.5px solid #2D5A3D' : '2.5px solid transparent',
                  marginBottom: -1,
                }}
              >
                {t.label}
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                  style={{
                    backgroundColor: active ? '#E8F2EB' : '#F7F1E6',
                    color: active ? '#2D5A3D' : '#7A6A5A',
                  }}
                >
                  {t.count}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Content par tab */}
      {!editing && (
        <div className="px-4 pt-3.5">
          {tab === 'annonces' && (
            annonces.length === 0 ? (
              <EmptyState label={isOwn ? 'Vous n\'avez pas encore d\'annonces' : 'Pas d\'annonces visibles'} />
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {annonces.map(a => (
                  <AnnonceMini key={a.id} a={a} />
                ))}
              </div>
            )
          )}

          {tab === 'events' && (
            events.length === 0 ? (
              <EmptyState label={isOwn ? 'Vous ne suivez encore aucun événement' : 'Aucun événement suivi'} />
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {events.map(e => (
                  <Link
                    key={e.id}
                    href={`/evenement/${e.id}`}
                    className="block overflow-hidden rounded-[14px] border bg-white text-inherit no-underline shadow-[0_1px_4px_rgba(44,28,16,0.04)]"
                    style={{ borderColor: '#F0EAE0' }}
                  >
                    <div className="relative h-[110px] bg-[#F0EBE3]">
                      {e.image_url && (
                        <img src={e.image_url} alt="" className="h-full w-full object-cover" />
                      )}
                    </div>
                    <div className="px-2.5 pb-2.5 pt-2">
                      <p className="m-0 line-clamp-2 text-[12px] font-bold leading-[1.35] text-texte">{e.titre}</p>
                      {e.date_debut && (
                        <p className="m-0 mt-1 text-[11px] text-texte-doux">
                          {new Date(e.date_debut + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                        </p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )
          )}

          {tab === 'abos' && (
            followings.length === 0 ? (
              <EmptyState label={isOwn ? 'Vous ne suivez encore personne' : 'Ne suit personne'} />
            ) : (
              <div className="flex flex-col gap-2">
                {followings.map(p => {
                  const pname = p.display_name ?? 'Anonyme'
                  return (
                    <Link
                      key={p.id}
                      href={`/profil/${p.id}`}
                      className="flex items-center gap-3 rounded-2xl border bg-white p-3 text-inherit no-underline shadow-[0_1px_4px_rgba(44,28,16,0.04)]"
                      style={{ borderColor: '#F0EAE0' }}
                    >
                      <Avatar name={pname} url={p.avatar_url} size={40} />
                      <span className="flex-1 truncate text-[14px] font-bold text-texte">{pname}</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A99B89" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 6 15 12 9 18"/>
                      </svg>
                    </Link>
                  )
                })}
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}

/* ─── Sub-components ─────────────────────────────────────────────────── */

function Stat({
  value, label, iconRight,
}: {
  value: number | string
  label: string
  iconRight?: React.ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-0.5">
      <div
        className="inline-flex items-center gap-1 text-[18px] font-extrabold text-texte"
        style={{ letterSpacing: '-0.02em' }}
      >
        {value}
        {iconRight}
      </div>
      <div className="text-[11px] font-semibold text-texte-doux">{label}</div>
    </div>
  )
}

function Divider() {
  return <div className="w-px self-stretch" style={{ backgroundColor: '#F0EAE0' }} />
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="py-14 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-cremeDeep text-texte-doux">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="8" y1="12" x2="16" y2="12"/>
        </svg>
      </div>
      <p className="m-0 text-[13px] text-texte-doux">{label}</p>
    </div>
  )
}

function AnnonceMini({ a }: { a: AnnonceSnippet }) {
  const tagPalette = TYPE_PALETTE[a.type] ?? TYPE_PALETTE.vente
  const prix = getPrixLabel(a)
  const photo = a.photos?.[0]
  return (
    <Link
      href={`/annonces/${a.id}`}
      className="block overflow-hidden rounded-[14px] border bg-white text-inherit no-underline shadow-[0_1px_4px_rgba(44,28,16,0.04)]"
      style={{ borderColor: '#F0EAE0' }}
    >
      <div className="relative h-[110px] bg-[#F0EBE3]">
        {photo && <img src={photo} alt="" className="h-full w-full object-cover" />}
        <span
          className="absolute left-2 top-2 rounded-[5px] px-[7px] py-[3px] text-[9px] font-extrabold tracking-[0.08em] text-white"
          style={{ backgroundColor: tagPalette.bg }}
        >
          {tagPalette.label}
        </span>
        {a.statut === 'vendu' && (
          <span className="absolute bottom-2 left-2 rounded-[5px] bg-[#1A1209]/85 px-[7px] py-[3px] text-[9px] font-extrabold uppercase tracking-[0.04em] text-white">
            Vendu
          </span>
        )}
      </div>
      <div className="px-2.5 pb-2.5 pt-2">
        <p className="m-0 truncate text-[13px] font-bold text-texte">{a.titre}</p>
        <p
          className="m-0 mt-0.5 text-[13px] font-extrabold"
          style={{ color: prix.color ?? '#1A1209' }}
        >
          {prix.value}
        </p>
      </div>
    </Link>
  )
}
