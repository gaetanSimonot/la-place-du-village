'use client'
import { useMemo } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { useDefilementDoux } from '@/hooks/useDefilementDoux'
import TitreVivant from '@/components/village/TitreVivant'
import { useTerritoire } from '@/components/TerritoireProvider'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { sectionVisible } from '@/lib/visibilite'
import type { Champignon, VisibiliteBois } from '@/lib/champignons'

/**
 * Bloc « Dans nos bois » — la rubrique champignons dans le flux du Village.
 *
 * Jumeau de `TheatreAffiche` : un rouleau de photos qui avance tout seul, et
 * « Voir tout » qui ouvre le guide (/bois). Une photo ouvre directement la
 * fiche de son espèce.
 *
 * On ne met en vitrine que les BONS COMESTIBLES : c'est ce qui donne envie
 * d'ouvrir le guide. Les espèces dangereuses sont dans le guide, avec leurs
 * avertissements — une belle photo d'amanite en accroche, sans le texte qui
 * va avec, serait la pire des vitrines.
 *
 * Disparaît s'il n'y a rien à montrer, et suit le réglage de visibilité à
 * trois états (`bois_village_public`), réglé dans l'admin sans déploiement.
 */

interface Payload {
  especes: Champignon[]
  villageVisibilite: VisibiliteBois
  villageInvite?: boolean
}

/** Même fetcher que le théâtre : le jeton dit au serveur si ce lecteur est invité. */
const fetcher = async ([u, connecte]: [string, string]) => {
  const entetes: Record<string, string> = {}
  if (connecte !== 'anon') {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) entetes.Authorization = `Bearer ${session.access_token}`
  }
  const r = await fetch(u, { headers: entetes })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

const VITRINE = new Set(['excellent', 'bon'])

export default function BoisAffiche({ isAdmin = false }: { isAdmin?: boolean }) {
  const { territoire } = useTerritoire()
  const { user } = useAuth()
  const slugTerr = territoire?.slug ?? null
  const { data } = useSWR<Payload>(
    [slugTerr ? `/api/champignons?territoire=${encodeURIComponent(slugTerr)}` : '/api/champignons',
     user?.id ?? 'anon'] as [string, string],
    fetcher, { revalidateOnFocus: false })

  const vitrine = useMemo(
    () => (data?.especes ?? []).filter(e => VITRINE.has(e.statut) && e.photo_url).slice(0, 12),
    [data])

  const piste = useDefilementDoux<HTMLDivElement>(vitrine.length)

  if (data && !sectionVisible(data.villageVisibilite, isAdmin, data.villageInvite)) return null
  if (!data || vitrine.length === 0) return null

  return (
    <>
      <div className="pcv-bh flex items-baseline justify-between gap-2.5 px-4 pb-2.5 pt-[18px]">
        <div>
          <h2 className="m-0 font-serif text-[20px] leading-[1.15] text-texte" style={{ letterSpacing: '-0.02em' }}>
            <TitreVivant texte="Dans nos bois" />
          </h2>
          <div className="pcv-sub pcv-only">Les champignons de chez nous, et comment les cuisiner</div>
        </div>
        <Link href="/bois" className="pcv-more flex shrink-0 items-center gap-1 text-[12.5px] font-bold no-underline" style={{ color: '#7E4426' }}>
          Voir tout
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" /><polyline points="13 6 19 12 13 18" />
          </svg>
        </Link>
      </div>

      {/* Écrite deux fois : la copie (lpv-defileDup) referme la boucle du
          défilement doux, et reste cachée tant qu'il ne tourne pas. */}
      <div>
      <div ref={piste} className="flex items-start gap-2.5 lg:overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
        {[...vitrine, ...vitrine].map((e, i) => {
          const copie = i >= vitrine.length
          return (
            <Link key={`${e.id}-${i}`} href={`/bois?espece=${e.id}`}
              className={`block shrink-0 overflow-hidden rounded-[12px] no-underline${copie ? ' lpv-defileDup' : ''}`}
              aria-hidden={copie} tabIndex={copie ? -1 : undefined}
              style={{ width: 118, boxShadow: '0 2px 8px rgba(44,28,16,.14)' }}>
              <span className="relative block w-full" style={{ aspectRatio: '3 / 4', background: 'linear-gradient(160deg,#D9DFD3,#B9C2B4)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={e.photo_url!} alt={e.nom} className="h-full w-full object-cover" loading="lazy" />
                <span className="absolute inset-x-0 bottom-0 px-2 py-1.5"
                  style={{ background: 'linear-gradient(to top, rgba(20,24,21,.9), transparent)' }}>
                  <span className="block text-[11.5px] font-extrabold leading-tight" style={{ color: '#FFFFFF' }}>
                    {e.nom}
                  </span>
                </span>
              </span>
            </Link>
          )
        })}
      </div>
      </div>

      <p className="m-0 px-4 pt-1.5 text-[11.5px]" style={{ color: '#7A6A5A' }}>
        {data.especes.length} espèces au guide · toujours faire vérifier sa cueillette
      </p>
    </>
  )
}
