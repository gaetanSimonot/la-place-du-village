'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import { momentAge, type Moment } from '@/lib/moments'
import MomentViewer from '@/components/moments/MomentViewer'
import MomentComposer from '@/components/moments/MomentComposer'
import BottomNavBar from '@/components/BottomNavBar'

export default function EnCeMomentClient() {
  const router = useRouter()
  const { user } = useAuth()
  const { openAuthModal } = useAuthModal()

  const [moments, setMoments] = useState<Moment[]>([])
  const [loading, setLoading] = useState(true)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)

  const load = async (openMomentId?: string | null, openFirst?: boolean) => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/moments', {
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    }).catch(() => null)
    const list = res && res.ok ? ((await res.json()).moments ?? []) as Moment[] : []
    setMoments(list)
    setLoading(false)
    if (openMomentId) {
      const i = list.findIndex(m => m.id === openMomentId)
      if (i >= 0) setViewerIndex(i)
    } else if (openFirst && list.length > 0) {
      setViewerIndex(0)   // pastille accueil → plein écran direct sur le + récent
    }
  }

  useEffect(() => {
    // Deep-link ?m=<id> ou ?view=1 (ouvre direct le viewer sur le + récent).
    const p = new URLSearchParams(window.location.search)
    load(p.get('m'), p.get('view') === '1')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Publication ouverte à tous (quota 1/mois gratuit géré côté serveur).
  const onShare = () => {
    if (!user) { openAuthModal(); return }
    setComposerOpen(true)
  }

  const markViewedLocal = (id: string) => setMoments(ms => ms.map(m => m.id === id ? { ...m, vu: true } : m))
  const removeLocal = (id: string) => setMoments(ms => ms.filter(m => m.id !== id))

  const unseenCount = moments.filter(m => !m.vu).length

  return (
    <div className="min-h-[100dvh] bg-creme font-inter" style={{ paddingBottom: 96 }}>
      {/* header */}
      <div className="flex items-center gap-3 px-4" style={{ paddingTop: 'max(16px,env(safe-area-inset-top,16px))' }}>
        <button onClick={() => router.push('/')} aria-label="Retour"
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl border border-bord bg-white text-texte">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        </button>
        <div className="min-w-0 flex-1">
          <div className="font-serif text-[21px] leading-none text-texte">En ce moment</div>
          <div className="mt-1 text-[11.5px] text-texte-doux">
            {loading ? '…' : moments.length === 0 ? 'Rien pour l’instant' : `${unseenCount > 0 ? `${unseenCount} nouvelle${unseenCount > 1 ? 's' : ''} · ` : ''}dans les dernières 24h`}
          </div>
        </div>
      </div>

      {/* bouton partager */}
      <div className="px-4 pt-4">
        <button onClick={onShare}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-none py-3.5 text-[14px] font-extrabold text-white"
          style={{ background: 'linear-gradient(135deg,#2D5A3D,#1C4A52)', boxShadow: '0 6px 18px rgba(45,90,61,0.25)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          Partager ce qui se passe
        </button>
      </div>

      {/* grille */}
      {loading ? (
        <div className="flex justify-center py-16"><div className="h-7 w-7 animate-spin rounded-full border-4 border-bord border-t-primary" /></div>
      ) : moments.length === 0 ? (
        <p className="px-8 pt-16 text-center text-[13px] leading-relaxed text-texte-doux">
          Aucun moment partagé pour l’instant.<br />Sois le premier à montrer ce qui se passe&nbsp;!
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2 px-4 pt-5">
          {moments.map((m, i) => (
            <button key={m.id} onClick={() => setViewerIndex(i)}
              className="relative overflow-hidden rounded-[14px] border-[2.5px] bg-[#1A1209]"
              style={{ aspectRatio: '3 / 4', borderColor: m.vu ? '#D8CFC2' : '#E8622A' }}>
              {m.media_kind === 'video'
                ? <video src={m.media_url} muted playsInline preload="metadata" poster={m.poster_url ?? undefined} className="absolute inset-0 h-full w-full object-cover" />
                // eslint-disable-next-line @next/next/no-img-element
                : <img src={m.poster_url ?? m.media_url} alt="" className="absolute inset-0 h-full w-full object-cover" />}
              <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,transparent 45%,rgba(0,0,0,0.72))' }} />
              <span className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-[#A85138] text-[9px] font-bold text-white">
                {m.auteur_avatar
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={m.auteur_avatar} alt="" className="h-full w-full object-cover" />
                  : (m.auteur_nom?.[0]?.toUpperCase() ?? '?')}
              </span>
              {m.media_kind === 'video' && (
                <span className="absolute right-1.5 top-1.5 text-white">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                </span>
              )}
              <div className="absolute inset-x-1.5 bottom-1.5 text-left text-white">
                <div className="truncate text-[10px] font-extrabold">{m.auteur_nom}</div>
                <div className="text-[8.5px] opacity-85">il y a {momentAge(m.created_at)}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {viewerIndex !== null && (
        <MomentViewer
          moments={moments}
          startIndex={viewerIndex}
          backLabel="Voir tout"
          onClose={() => setViewerIndex(null)}
          onViewed={markViewedLocal}
          onDeleted={removeLocal}
        />
      )}
      {composerOpen && (
        <MomentComposer onClose={() => setComposerOpen(false)} onPublished={() => { setComposerOpen(false); setLoading(true); load() }} />
      )}

      <BottomNavBar />
    </div>
  )
}
