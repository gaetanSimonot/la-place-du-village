'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { momentAge, type Moment } from '@/lib/moments'
import MomentViewer from '@/components/moments/MomentViewer'
import MomentComposer from '@/components/moments/MomentComposer'

interface Props {
  /** L'user dont on affiche les reels. */
  profileUserId: string
}

/**
 * Onglet « Reels » du mur : tous les moments de l'user (actifs ET expirés —
 * ils restent ici une fois disparus de l'accueil). Sur son propre profil,
 * bouton « Partager ce qui se passe ». Clic sur une vignette → viewer.
 */
export default function ReelsTab({ profileUserId }: Props) {
  const { user } = useAuth()
  const isOwn = !!user && user.id === profileUserId
  const [moments, setMoments] = useState<Moment[]>([])
  const [loading, setLoading] = useState(true)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/api/moments?auteur=${profileUserId}`, {
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    }).catch(() => null)
    const list = res && res.ok ? ((await res.json()).moments ?? []) as Moment[] : []
    setMoments(list); setLoading(false)
  }

  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [profileUserId])

  return (
    <div className="px-4 pt-4">
      {isOwn && (
        <button onClick={() => setComposerOpen(true)}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-2xl border-none py-3 text-[14px] font-extrabold text-white"
          style={{ background: 'linear-gradient(135deg,#2D5A3D,#1C4A52)', boxShadow: '0 6px 18px rgba(45,90,61,0.25)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          Partager ce qui se passe
        </button>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="h-7 w-7 animate-spin rounded-full border-4 border-bord border-t-primary" /></div>
      ) : moments.length === 0 ? (
        <p className="px-4 py-10 text-center text-[13px] leading-relaxed text-texte-doux">
          {isOwn ? 'Tu n’as pas encore partagé de reel.' : 'Aucun reel pour l’instant.'}
        </p>
      ) : (
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
              {isOwn && m.sur_accueil && (
                <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/45 px-1.5 py-0.5 text-[7.5px] font-bold text-white backdrop-blur-sm">
                  <span className="h-1 w-1 rounded-full bg-[#E8622A]" /> Accueil
                </span>
              )}
              <span className="absolute bottom-1.5 left-1.5 text-[8.5px] font-bold text-white opacity-90">il y a {momentAge(m.created_at)}</span>
            </button>
          ))}
        </div>
      )}

      {viewerIndex !== null && (
        <MomentViewer
          moments={moments}
          startIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onDeleted={id => setMoments(ms => ms.filter(m => m.id !== id))}
        />
      )}
      {composerOpen && (
        <MomentComposer onClose={() => setComposerOpen(false)} onPublished={() => { setComposerOpen(false); load() }} />
      )}
    </div>
  )
}
