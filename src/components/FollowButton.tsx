'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

interface Props {
  targetUserId: string
  /** Style clair sur fond sombre (viewer reel). */
  dark?: boolean
  className?: string
}

/**
 * Bouton « Suivre / Suivi » (abonnement asymétrique, table `follows`).
 * Masqué si non connecté ou si on regarde son propre contenu.
 */
export default function FollowButton({ targetUserId, dark = false, className }: Props) {
  const { user } = useAuth()
  const [following, setFollowing] = useState<boolean | null>(null)  // null = pas encore chargé
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user || user.id === targetUserId) { setFollowing(null); return }
    let cancelled = false
    supabase.from('follows').select('follower_id').eq('follower_id', user.id).eq('followed_id', targetUserId).maybeSingle()
      .then(({ data }) => { if (!cancelled) setFollowing(!!data) })
    return () => { cancelled = true }
  }, [user, targetUserId])

  if (!user || user.id === targetUserId || following === null) return null

  const toggle = async () => {
    if (busy) return
    setBusy(true)
    const next = !following
    setFollowing(next)   // optimiste
    if (next) await supabase.from('follows').insert({ follower_id: user.id, followed_id: targetUserId })
    else await supabase.from('follows').delete().eq('follower_id', user.id).eq('followed_id', targetUserId)
    setBusy(false)
  }

  const base: React.CSSProperties = {
    padding: '6px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 800, cursor: 'pointer',
    border: '1.5px solid', transition: 'all 0.15s', whiteSpace: 'nowrap',
  }
  const style: React.CSSProperties = following
    ? dark
      ? { ...base, background: 'rgba(255,255,255,0.16)', borderColor: 'rgba(255,255,255,0.4)', color: '#fff' }
      : { ...base, background: '#F0EAE0', borderColor: '#E5DDD2', color: '#7A6A5A' }
    : dark
      ? { ...base, background: '#E8622A', borderColor: '#E8622A', color: '#fff' }
      : { ...base, background: 'var(--primary)', borderColor: 'var(--primary)', color: '#fff' }

  return (
    <button onClick={toggle} disabled={busy} style={style} className={className}>
      {following ? 'Suivi' : 'Suivre'}
    </button>
  )
}
