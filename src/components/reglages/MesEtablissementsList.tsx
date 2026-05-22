'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

interface Etab {
  id: string
  nom: string
  commune: string | null
  photos: string[] | null
  plan: string | null
}

const IcStore = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l1-5h16l1 5" />
    <path d="M4 9v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" />
    <path d="M9 21V12h6v9" />
  </svg>
)
const IcChev = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 6 15 12 9 18" />
  </svg>
)

export default function MesEtablissementsList() {
  const { user } = useAuth()
  const [etabs, setEtabs]     = useState<Etab[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    supabase
      .from('etablissements')
      .select('id, nom, commune, photos, plan')
      .eq('user_id', user.id)
      .order('nom', { ascending: true })
      .then(({ data }) => {
        if (!cancelled) {
          setEtabs((data as Etab[] | null) ?? [])
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [user?.id])

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-bord border-t-primary" />
      </div>
    )
  }

  if (etabs.length === 0) {
    return (
      <div className="mx-4 mt-4 rounded-[14px] border bg-white p-6 text-center" style={{ borderColor: '#F0EAE0' }}>
        <p className="m-0 mb-1 text-[14px] font-extrabold text-texte">Aucun établissement</p>
        <p className="m-0 text-[12px] text-texte-doux">
          Tes fiches d&apos;établissement apparaîtront ici une fois revendiquées.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 px-4 pt-3">
      {etabs.map(e => (
        <Link
          key={e.id}
          href={`/etablissement/${e.id}`}
          className="flex items-center gap-3 rounded-[14px] border bg-white px-3 py-2.5 text-inherit no-underline"
          style={{ borderColor: '#F0EAE0' }}
        >
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[11px] bg-primary-light text-primary"
            aria-hidden
          >
            {e.photos?.[0]
              ? <img src={e.photos[0]} alt="" className="h-full w-full object-cover" />
              : <IcStore />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-extrabold text-texte" style={{ letterSpacing: '-0.005em' }}>
              {e.nom}
            </div>
            {e.commune && <div className="truncate text-[11.5px] text-texte-doux">{e.commune}</div>}
          </div>
          {e.plan && e.plan !== 'basic' && (
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-extrabold uppercase"
              style={{ background: '#E8F2EB', color: '#2D5A3D', letterSpacing: '0.08em' }}
            >
              {e.plan}
            </span>
          )}
          <span className="shrink-0 text-texte-tres-doux"><IcChev /></span>
        </Link>
      ))}
    </div>
  )
}
