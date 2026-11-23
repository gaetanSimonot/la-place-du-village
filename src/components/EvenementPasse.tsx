'use client'
import Link from 'next/link'
import EventCard from '@/components/EventCard'
import { formatDate } from '@/lib/filters'
import type { Evenement } from '@/lib/types'

/** Ce que la fiche d'un événement passé montre ensuite — calculé par le serveur. */
export interface SuitePasse {
  /** « Prochainement à Ganges » — composé par le serveur (aLaCommune). */
  titre: string
  aVenir: Evenement[]
  lienTout: { href: string; label: string } | null
}

/**
 * Bandeau en tête de fiche : l'événement est terminé. Dit simplement, sans
 * cacher la fiche — on peut encore lire ce que c'était, et où.
 */
export function BandeauPasse({ evt }: { evt: Pick<Evenement, 'date_debut' | 'date_fin'> }) {
  const fin = evt.date_fin && evt.date_fin !== evt.date_debut ? evt.date_fin : evt.date_debut
  return (
    <div className="mb-3 flex items-start gap-2.5 rounded-2xl border border-[#E8E0D4] bg-[#FAF7F2] px-3.5 py-3">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mt-px shrink-0 text-texte-doux" aria-hidden>
        <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
      </svg>
      <p className="m-0 text-[13px] leading-[1.45] text-texte">
        <span className="font-extrabold">Cet événement est terminé</span>
        {fin ? <> — il a eu lieu {evt.date_fin && evt.date_fin !== evt.date_debut ? "jusqu'au" : 'le'} {formatDate(fin, 'long')}.</> : '.'}
        {' '}Voici ce qui arrive ensuite.
      </p>
    </div>
  )
}

/** La suite : les prochains rendez-vous de la commune, et le lien vers tout l'agenda. */
export function SuiteDuPasse({ suite }: { suite: SuitePasse }) {
  if (suite.aVenir.length === 0 && !suite.lienTout) return null
  return (
    <div className="px-4 pt-[18px]">
      <div className="mb-2.5 text-[11px] font-extrabold tracking-[0.1em] text-texte-doux">
        {suite.titre.toUpperCase()}
      </div>
      {suite.aVenir.length > 0 && (
        <div className="flex flex-col gap-3">
          {suite.aVenir.map(e => <EventCard key={e.id} evenement={e} />)}
        </div>
      )}
      {suite.lienTout && (
        <Link
          href={suite.lienTout.href}
          className="mt-3.5 flex h-12 items-center justify-center rounded-full bg-primary text-[15px] font-extrabold text-white no-underline"
        >
          {suite.lienTout.label}
        </Link>
      )}
    </div>
  )
}
