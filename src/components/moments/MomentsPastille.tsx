'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Moment } from '@/lib/moments'

/**
 * Pastille « En ce moment » dans la TopBar de l'accueil : avatars empilés des
 * derniers auteurs + point rouge si au moins un moment non vu. Toujours
 * cliquable (mène au landing où se trouve le bouton Partager), même sans
 * moment actif (affiche alors une icône caméra neutre).
 */
export default function MomentsPastille() {
  const router = useRouter()
  const [moments, setMoments] = useState<Moment[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/moments', {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      }).catch(() => null)
      if (!res || !res.ok || cancelled) return
      const d = await res.json()
      setMoments((d.moments ?? []) as Moment[])
    })()
    return () => { cancelled = true }
  }, [])

  const hasUnseen = moments.some(m => !m.vu)
  // Avatars distincts par auteur, max 3
  const avatars: { id: string; avatar: string | null; nom: string }[] = []
  const seen = new Set<string>()
  for (const m of moments) {
    if (seen.has(m.auteur_id)) continue
    seen.add(m.auteur_id)
    avatars.push({ id: m.auteur_id, avatar: m.auteur_avatar, nom: m.auteur_nom })
    if (avatars.length >= 3) break
  }

  // Plein écran direct sur le reel le plus récent (?view=1). Le bouton
  // « ‹ Voir tout » du viewer ramène ensuite à la grille.
  const go = () => router.push('/en-ce-moment?view=1')

  if (moments.length === 0) {
    return (
      <button onClick={go} aria-label="En ce moment"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-bord bg-white text-texte shadow-[0_1px_2px_rgba(44,28,16,0.04)]">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
        </svg>
      </button>
    )
  }

  return (
    <button onClick={go} aria-label="En ce moment"
      className="relative flex h-10 shrink-0 items-center rounded-xl border border-bord bg-white pl-2 pr-2.5 shadow-[0_1px_2px_rgba(44,28,16,0.04)]">
      <div className="flex items-center">
        {avatars.map((a, i) => (
          <span key={a.id}
            className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border-2 text-[10px] font-bold text-white"
            style={{ marginLeft: i === 0 ? 0 : -8, borderColor: hasUnseen ? '#E8622A' : '#D8CFC2', background: '#A85138', zIndex: 3 - i }}>
            {a.avatar
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={a.avatar} alt="" className="h-full w-full object-cover" />
              : (a.nom?.[0]?.toUpperCase() ?? '?')}
          </span>
        ))}
      </div>
      {hasUnseen && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#E8622A]" />}
    </button>
  )
}
