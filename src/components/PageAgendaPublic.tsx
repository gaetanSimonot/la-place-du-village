import Link from 'next/link'
import { ListeCartouches } from '@/components/EventListCard'
import BottomNavBar, { NAV_H } from '@/components/BottomNavBar'
import PartagerPage from '@/components/PartagerPage'
import OngletsPages from '@/components/OngletsPages'
import { lienEvenement } from '@/lib/lienEvenement'
import { enJsonLd, SITE } from '@/lib/seo'
import type { Evenement, EvenementCard } from '@/lib/types'
import type { GroupeLiens, Lien, Onglet, SourcePage } from '@/lib/agendaPublic'

/**
 * Le gabarit des pages d'entrée depuis Google (« Que faire à Ganges ? »,
 * « Concerts dans les Cévennes », « Ce week-end »), dans l'allure de l'agenda
 * de l'app : en-tête au logo, pastilles de type en haut, les cartouches de
 * l'agenda (EventListCard, la même que sur la carte, avec ses boutons carte,
 * favori, partage), barre du bas. Rendu
 * serveur : tout est dans le HTML que lit Google.
 */
export default function PageAgendaPublic({ titre, resume, evenements, total, source, vide, ariane = [], onglets = [], titreListe, liens = [] }: {
  titre: string
  /** La ligne sous le titre : « 33 événements » en gras, puis la suite. */
  resume: { n: number; suite?: string }
  /** Les premières cartouches (PAR_PAGE) ; la suite vient en descendant. */
  evenements: Evenement[]
  /** Combien la liste en compte en tout, et où demander la suite. */
  total?: number
  source?: SourcePage
  vide: string
  /** Le chemin au-dessus : Cévennes › Ganges. */
  ariane?: Lien[]
  /** Les pastilles de type : « Tout », « Ateliers 11 »… chacune est une page. */
  onglets?: Onglet[]
  /** Intertitre au-dessus des cartouches (page territoire : « Ce week-end »). */
  titreListe?: string
  /** Un petit bloc en bas : les communes autour, ou toutes les communes. */
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
    <main className="min-h-[100dvh] bg-creme font-inter text-texte" style={{ paddingBottom: `calc(${NAV_H + 24}px + env(safe-area-inset-bottom))` }}>
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: enJsonLd(ld) }} />}

      {/* L'en-tête de la carte : logo, Partager. */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: '#fff', padding: '8px 12px', paddingTop: 'max(8px, env(safe-area-inset-top, 8px))', borderBottom: '1px solid #EDE8E0', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
        <Link href="/" aria-label="La Place, accueil" style={{ lineHeight: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-topbar.webp" alt="La Place" style={{ height: 38, width: 'auto', objectFit: 'contain', display: 'block' }} />
        </Link>
        <PartagerPage titre={titre} />
      </header>

      <div className="px-4 pt-4">
        {ariane.length > 0 && (
          <nav aria-label="Vous êtes ici" className="mb-1.5 text-[12px] font-semibold" style={{ color: '#6B5E4E' }}>
            {ariane.map((a, i) => (
              <span key={a.href}>
                {i > 0 && <span aria-hidden> › </span>}
                <Link href={a.href} style={{ color: '#2D5A3D', textDecoration: 'none' }}>{a.label}</Link>
              </span>
            ))}
          </nav>
        )}
        <h1 className="m-0 font-title text-[24px] leading-[1.15]" style={{ color: '#1A1209', letterSpacing: '-0.01em' }}>{titre}</h1>
        <p className="m-0 mt-1 text-[13px]" style={{ color: '#6B5E4E' }}>
          <b style={{ color: '#1A1209' }}>{resume.n} événement{resume.n > 1 ? 's' : ''}</b>
          {resume.suite ? ` · ${resume.suite}` : ''}
        </p>
      </div>

      {/* Les types, en haut, comme les filtres de l'agenda — mais chacun est
          une page (« Ateliers à Ganges »), donc un vrai lien pour Google. */}
      {onglets.length > 1 && <OngletsPages onglets={onglets} />}

      <div className="px-3 pt-4">
        {titreListe && evenements.length > 0 && (
          <h2 className="m-0 mb-2.5 px-1 font-title text-[16px]" style={{ color: '#1A1209' }}>{titreListe}</h2>
        )}
        {evenements.length === 0 ? (
          <p className="m-0 px-1 pt-2 text-[14px]" style={{ color: '#6B5E4E' }}>{vide}</p>
        ) : (
          <ListeCartouches evenements={evenements as unknown as EvenementCard[]} total={total} source={source} />
        )}
      </div>

      {liens.map(g => (
        <nav key={g.titre} aria-label={g.titre} className="mt-7 px-4">
          <h2 className="m-0 font-title text-[16px]" style={{ color: '#1A1209' }}>{g.titre}</h2>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {g.liens.map(l => (
              <Link
                key={l.href}
                href={l.href}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 32, padding: '0 12px', borderRadius: 999, background: '#fff', border: '1px solid #E6DCC8', color: '#1A1209', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
              >
                {l.label}
                {l.n != null && <span style={{ fontWeight: 500, color: '#6B5E4E' }}>{l.n}</span>}
              </Link>
            ))}
          </div>
        </nav>
      ))}

      <BottomNavBar activeTab="carte" />
    </main>
  )
}

/**
 * L'écran d'attente des pages d'entrée (loading.tsx) : même en-tête, même
 * barre du bas, des cartouches grises. Affiché AUSSITÔT qu'on touche une
 * pastille ou un lien, pendant que la page suivante arrive.
 */
export function SqueletteAgendaPublic() {
  const gris = '#ECE6DC'
  return (
    <main className="min-h-[100dvh] bg-creme font-inter" style={{ paddingBottom: `calc(${NAV_H + 24}px + env(safe-area-inset-bottom))` }} aria-busy="true">
      <header style={{ position: 'sticky', top: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: '#fff', padding: '8px 12px', paddingTop: 'max(8px, env(safe-area-inset-top, 8px))', borderBottom: '1px solid #EDE8E0', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-topbar.webp" alt="La Place" style={{ height: 38, width: 'auto', objectFit: 'contain', display: 'block' }} />
        <div style={{ width: 92, height: 34, borderRadius: 999, background: '#F7F1E6' }} />
      </header>
      <div className="animate-pulse px-4 pt-4">
        <div style={{ width: '45%', height: 12, borderRadius: 6, background: gris }} />
        <div style={{ width: '75%', height: 26, borderRadius: 8, background: gris, marginTop: 10 }} />
        <div style={{ width: '55%', height: 13, borderRadius: 6, background: gris, marginTop: 8 }} />
        <div className="mt-4 flex gap-2">
          {[70, 96, 110, 88].map((w, i) => <div key={i} style={{ width: w, height: 34, borderRadius: 999, background: gris, flexShrink: 0 }} />)}
        </div>
      </div>
      <div className="flex animate-pulse flex-col gap-2.5 px-3 pt-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} style={{ display: 'flex', height: 86, borderRadius: 14, overflow: 'hidden', background: '#fff', boxShadow: '0 1px 6px rgba(44,44,44,0.09)' }}>
            <div style={{ width: 86, background: gris }} />
            <div style={{ flex: 1, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ width: 70, height: 12, borderRadius: 999, background: gris }} />
              <div style={{ width: '85%', height: 13, borderRadius: 6, background: gris }} />
              <div style={{ width: '40%', height: 11, borderRadius: 6, background: gris }} />
            </div>
          </div>
        ))}
      </div>
      <BottomNavBar activeTab="carte" />
    </main>
  )
}
