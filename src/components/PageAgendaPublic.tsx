import Link from 'next/link'
import EventCard from '@/components/EventCard'
import { lienEvenement } from '@/lib/lienEvenement'
import { enJsonLd, SITE } from '@/lib/seo'
import type { Evenement } from '@/lib/types'
import type { GroupeLiens } from '@/lib/agendaPublic'

/**
 * Le gabarit des pages d'entrée depuis Google (« Ce week-end », « Que faire
 * à … ») : un titre, le bouton vers la carte, puis les cartes d'événements de
 * l'app, chacune menant à sa fiche. Rendu serveur : tout est dans le HTML.
 */
export default function PageAgendaPublic({ titre, sousTitre, lienCarte, evenements, vide, titreListe, liens }: {
  titre: string
  sousTitre: string
  lienCarte: string
  evenements: Evenement[]
  vide: string
  /** Intertitre au-dessus des cartes (page territoire : « Ce week-end »). */
  titreListe?: string
  /** Les pages voisines dans la hiérarchie (types, communes, territoire). */
  liens?: GroupeLiens[]
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
    <main className="min-h-[100dvh] bg-creme px-4 pb-28 pt-5 font-inter text-texte">
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: enJsonLd(ld) }} />}
      <Link href="/" className="font-title text-[20px] font-extrabold text-primary no-underline">La Place</Link>

      <h1 className="m-0 mt-4 font-title text-[28px] leading-[1.1] text-texte" style={{ letterSpacing: '-0.02em' }}>{titre}</h1>
      <p className="m-0 mt-2 text-[15px] text-texte-doux">{sousTitre}</p>

      {/* Flottant, toujours à portée : cette page sert à être trouvée, l'app est la vraie destination. */}
      <Link
        href={lienCarte}
        className="fixed bottom-[calc(16px+env(safe-area-inset-bottom))] left-1/2 z-50 flex h-12 w-[calc(100%-32px)] max-w-[480px] -translate-x-1/2 items-center justify-center gap-2 rounded-full bg-primary text-[15px] font-extrabold text-white no-underline shadow-[0_6px_20px_rgba(0,0,0,0.22)]"
      >
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" /><path d="M9 4v14M15 6v14" />
        </svg>
        Voir sur la carte
      </Link>

      {titreListe && evenements.length > 0 && (
        <h2 className="m-0 mt-6 font-title text-[19px] text-texte">{titreListe}</h2>
      )}
      {evenements.length === 0 ? (
        <p className="m-0 mt-8 text-[15px] text-texte-doux">{vide}</p>
      ) : (
        <div className="mt-5 flex flex-col gap-3">
          {evenements.map(e => <EventCard key={e.id} evenement={e} />)}
        </div>
      )}

      {liens?.map(g => (
        <nav key={g.titre} className="mt-8" aria-label={g.titre}>
          <h2 className="m-0 font-title text-[17px] text-texte">{g.titre}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {g.liens.map(l => (
              <Link
                key={l.href}
                href={l.href}
                className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3.5 py-2 text-[14px] font-semibold text-texte no-underline"
              >
                {l.label}
                {l.n != null && <span className="text-[12px] font-normal text-texte-doux">{l.n}</span>}
              </Link>
            ))}
          </div>
        </nav>
      ))}
    </main>
  )
}
