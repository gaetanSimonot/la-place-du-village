'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { EvenementCard } from '@/lib/types'
import { CATEGORIES } from '@/lib/categories'
import { formatDate } from '@/lib/filters'

type StarredEvent = EvenementCard & {
  starred_by: Array<{ id: string; display_name: string | null; avatar_url: string | null }>
}

function MiniAvatar({ name, url }: { name: string; url?: string | null }) {
  if (url) return <img src={url} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1.5px solid #fff' }} />
  return (
    <div style={{
      width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
      border: '1.5px solid #fff',
      backgroundColor: 'var(--primary-light)', color: 'var(--primary)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 800, fontSize: 9, fontFamily: 'Inter, sans-serif',
    }}>{(name[0] ?? '?').toUpperCase()}</div>
  )
}

function FeedCard({ evt }: { evt: StarredEvent }) {
  const cat = CATEGORIES[evt.categorie] ?? CATEGORIES.autre
  const names = evt.starred_by.map(p => p.display_name || 'Quelqu\'un')
  const label = names.length === 1
    ? `${names[0]} est intÃ©ressÃ©Â·e`
    : names.length === 2
    ? `${names[0]} et ${names[1]}`
    : `${names[0]} et ${names.length - 1} autres`

  return (
    <Link href={`/evenement/${evt.id}`} style={{ display: 'block', textDecoration: 'none' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 10px rgba(44,44,44,0.08)' }}>
        <div style={{ position: 'relative', height: 120 }}>
          {evt.image_url
            ? <img src={evt.image_url} alt={evt.titre} loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: evt.image_position ?? '50% 50%' }} />
            : <div style={{ position: 'absolute', inset: 0, backgroundColor: cat.color }} />
          }
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 60%)' }} />
          <span style={{ position: 'absolute', top: 10, left: 10, fontSize: 10, fontWeight: 800, color: '#fff', backgroundColor: cat.color, borderRadius: 999, padding: '3px 9px' }}>
            {cat.emoji} {cat.label}
          </span>
        </div>
        <div style={{ padding: '10px 12px 12px' }}>
          <h3 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 15, color: '#2C1810', margin: '0 0 3px', lineHeight: 1.3 }}>
            {evt.titre}
          </h3>
          {evt.date_debut && (
            <p style={{ fontSize: 12, color: '#8A8A8A', margin: '0 0 8px' }}>
              {formatDate(evt.date_debut)}{evt.heure ? ` Â· ${evt.heure.slice(0, 5)}` : ''}{evt.lieux?.commune ? ` â€¢ ${evt.lieux.commune}` : ''}
            </p>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ display: 'flex' }}>
              {evt.starred_by.slice(0, 3).map((p, i) => (
                <div key={p.id} style={{ marginLeft: i === 0 ? 0 : -8, position: 'relative', zIndex: 3 - i }}>
                  <MiniAvatar name={p.display_name || '?'} url={p.avatar_url} />
                </div>
              ))}
            </div>
            <span style={{ fontSize: 12, color: '#6B7280' }}>â­ {label}</span>
          </div>
        </div>
      </div>
    </Link>
  )
}

export default function AbonnementsView() {
  const { user } = useAuth()
  const [events, setEvents] = useState<StarredEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [followCount, setFollowCount] = useState<number | null>(null)

  useEffect(() => {
    if (!user) return
    setLoading(true)

    async function load() {
      const { data: followData } = await supabase
        .from('follows')
        .select('followed_id')
        .eq('follower_id', user!.id)

      const followedIds = (followData ?? []).map((f: { followed_id: string }) => f.followed_id)
      setFollowCount(followedIds.length)

      if (followedIds.length === 0) { setLoading(false); return }

      const { data: interestData } = await supabase
        .from('interests')
        .select('evenement_id, user_id, created_at, evenements(id, titre, categorie, date_debut, heure, image_url, image_position, lieux(nom, commune))')
        .in('user_id', followedIds)
        .order('created_at', { ascending: false })
        .limit(100)

      const userIds = Array.from(new Set((interestData ?? []).map((i: { user_id: string }) => i.user_id)))
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', userIds)

      const profileMap: Record<string, { id: string; display_name: string | null; avatar_url: string | null }> =
        Object.fromEntries((profileData ?? []).map(p => [p.id, p]))

      const eventMap = new Map<string, StarredEvent>()
      for (const i of interestData ?? []) {
        const evtData = (i as unknown as { evenements: EvenementCard | null }).evenements
        if (!evtData?.id) continue
        if (!eventMap.has(i.evenement_id)) {
          eventMap.set(i.evenement_id, { ...evtData, starred_by: [] })
        }
        eventMap.get(i.evenement_id)!.starred_by.push(
          profileMap[i.user_id] ?? { id: i.user_id, display_name: null, avatar_url: null }
        )
      }

      setEvents(Array.from(eventMap.values()))
      setLoading(false)
    }

    load()
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ minHeight: '100%', backgroundColor: 'var(--creme)', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#fff', borderBottom: '1px solid #EDE8E0', padding: '12px 16px' }}>
        <h1 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 18, color: '#2C1810', margin: 0 }}>Abonnements</h1>
      </div>

      <div style={{ padding: '16px 16px 40px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {!user ? (
          <EmptyState emoji="â­" title="Connecte-toi pour voir le feed" sub="Les Ã©vÃ©nements â­ des gens que tu suis apparaÃ®tront ici." />
        ) : loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid #E0D8CE', borderTopColor: 'var(--primary)', animation: 'spin 0.7s linear infinite' }} />
          </div>
        ) : followCount === 0 ? (
          <EmptyState emoji="ðŸ‘¥" title="Tu ne suis personne encore" sub="Visite les profils des participants pour les suivre." />
        ) : events.length === 0 ? (
          <EmptyState emoji="ðŸ””" title="Rien pour l'instant" sub="Les gens que tu suis n'ont pas encore marquÃ© d'Ã©vÃ©nements." />
        ) : (
          events.map(evt => <FeedCard key={evt.id} evt={evt} />)
        )}
      </div>
    </div>
  )
}

function EmptyState({ emoji, title, sub }: { emoji: string; title: string; sub: string }) {
  return (
    <div style={{ textAlign: 'center', paddingTop: 60 }}>
      <p style={{ fontSize: 48, marginBottom: 12 }}>{emoji}</p>
      <p style={{ fontWeight: 700, fontSize: 16, fontFamily: 'Inter, sans-serif', color: '#2C1810', marginBottom: 6 }}>{title}</p>
      <p style={{ fontSize: 13, color: '#8A8A8A' }}>{sub}</p>
    </div>
  )
}
