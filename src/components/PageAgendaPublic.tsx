import Link from 'next/link'
import EventCard from '@/components/EventCard'
import { lienEvenement } from '@/lib/lienEvenement'
import { enJsonLd, SITE } from '@/lib/seo'
import type { Evenement } from '@/lib/types'

/**
 * Le gabarit des pages d'entrée depuis Google (« Ce week-end », « Que faire
 * à … ») : un titre, le bouton vers la carte, puis les cartes d'événements de
 * l'app, chacune menant à sa fiche. Rendu serveur : tout est dans le HTML.
 */
export default function PageAgendaPublic({ titre, sousTitre, lienCarte, evenements, vide }: {
  titre: string
  sousTitre: string
  lienCarte: string
  evenements: Evenement[]
  vide: string
}) {
  // La liste, dite aux moteurs : chaque entrée pointe vers sa fiche.
  const ld = evenements.length ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: titre,
    itemListElement: evenements.slice(0, 50).map((e, i) => ({
      '@type': 'ListItem', position: i + 1, url: `${SITE}${lienEvenement(e)}`, name: e.titre,
    })),
  } : null

  return (
    <main className="min-h-[100dvh] bg-creme px-4 pb-16 pt-5 font-inter text-texte">
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: enJsonLd(ld) }} />}
      <Link href="/" className="font-title text-[20px] font-extrabold text-primary no-underline">La Place</Link>

      <h1 className="m-0 mt-4 font-title text-[28px] leading-[1.1] text-texte" style={{ letterSpacing: '-0.02em' }}>{titre}</h1>
      <p className="m-0 mt-2 text-[15px] text-texte-doux">{sousTitre}</p>

      <Link
        href={lienCarte}
        className="mt-4 flex h-12 items-center justify-center gap-2 rounded-full bg-primary text-[15px] font-extrabold text-white no-underline"
      >
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" /><path d="M9 4v14M15 6v14" />
        </svg>
        Voir sur la carte
      </Link>

      {evenements.length === 0 ? (
        <p className="m-0 mt-8 text-[15px] text-texte-doux">{vide}</p>
      ) : (
        <div className="mt-5 flex flex-col gap-3">
          {evenements.map(e => <EventCard key={e.id} evenement={e} />)}
        </div>
      )}
    </main>
  )
}
