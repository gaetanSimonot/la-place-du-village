'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { momentAge, type Moment } from '@/lib/moments'
import MomentViewer from '@/components/moments/MomentViewer'

interface Props {
  /** L'user dont on affiche les reels. */
  profileUserId: string
}

/**
 * Onglet « Reels » du mur : tous les moments de l'user (actifs ET expirés —
 * ils restent ici une fois disparus de l'accueil). Clic → viewer plein écran.
 */
export default function ReelsTab({ profileUserId }: Props) {
  const [moments, setMoments] = useState<Moment[]>([])
  const [loading, setLoading] = useState(true)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/moments?auteur=${profileUserId}`, {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      }).catch(() => null)
      if (cancelled) return
      const list = res && res.ok ? ((await res.json()).moments ?? []) as Moment[] : []
      setMoments(list); setLoading(false)
    })()
    return () => { cancelled = true }
  }, [profileUserId])

  if (loading) {
    return <div className="flex justify-center py-12"><div className="h-7 w-7 animate-spin rounded-full border-4 border-bord border-t-primary" /></div>
  }

  if (moments.length === 0) {
    return <p className="px-8 py-12 text-center text-[13px] leading-relaxed text-texte-doux">Aucun reel pour l’instant.</p>
  }

  return (
    <div className="px-4 pt-4">
      <div className="grid grid-cols-3 gap-2">
        {moments.map((m, i) => (
          <button key={m.id} onClick={() => setViewerIndex(i)}
            className="relative overflow-hidden rounded-[12px] border border-bord bg-[#1A1209]"
            style={{ aspectRatio: '3 / 4' }}>
            {m.media_kind === 'video'
              ? <video src={m.media_url} muted playsInline preload="metadata" poster={m.poster_url ?? undefined} className="absolute inset-0 h-full w-full object-cover" />
              // eslint-disable-next-line @next/next/no-img-element
              : <img src={m.poster_url ?? m.media_url} alt="" className="absolute inset-0 h-full w-full object-cover" />}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,transparent 55%,rgba(0,0,0,0.7))' }} />
            {m.media_kind === 'video' && (
              <span className="absolute right-1.5 top-1.5 text-white"><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg></span>
            )}
            <span className="absolute bottom-1.5 left-1.5 text-[8.5px] font-bold text-white opacity-90">il y a {momentAge(m.created_at)}</span>
          </button>
        ))}
      </div>

      {viewerIndex !== null && (
        <MomentViewer
          moments={moments}
          startIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onDeleted={id => setMoments(ms => ms.filter(m => m.id !== id))}
        />
      )}
    </div>
  )
}
