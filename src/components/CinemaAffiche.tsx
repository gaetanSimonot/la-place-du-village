'use client'
import { useMemo } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { useTerritoire } from '@/components/TerritoireProvider'
import type { Cinema, Film, Seance, VisibiliteCinema } from '@/lib/cinema'

/**
 * Bloc « Au cinéma » — une carte insérée dans le flux du Village.
 *
 * Ce qu'il annonce, c'est l'affiche du moment, pas le programme du jour : un
 * cinéma fermé le mardi joue quand même les mêmes films, et un habitant qui
 * passe le mardi doit voir ce qui se donne cette semaine. Le bloc **disparaît
 * entièrement** quand rien n'est programmé — jamais de carte vide.
 *
 * Visibilité : trois états réglés depuis l'admin, sans déploiement — masqué
 * pour tout le monde, visible des seuls admins, ou visible de tous. C'est le
 * composant qui décide, pas son appelant, pour qu'il n'y ait qu'un seul
 * endroit à regarder.
 */

interface Payload {
  /** Salles qui ont quelque chose à l’affiche — pas « la » salle. */
  cinemas: Cinema[]
  films: Film[]
  seances: Seance[]
  aujourdhui: string
  villageVisibilite: VisibiliteCinema
}

const fetcher = async (u: string) => {
  const r = await fetch(u)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

export default function CinemaAffiche({ isAdmin = false }: { isAdmin?: boolean }) {
  const { territoire } = useTerritoire()
  const slugTerr = territoire?.slug ?? null
  const { data } = useSWR<Payload>(slugTerr ? `/api/cinema/affiche?territoire=${encodeURIComponent(slugTerr)}` : '/api/cinema/affiche', fetcher, { revalidateOnFocus: false })

  const aujourdhui = data?.aujourdhui ?? ''
  const seancesDuJour = useMemo(
    () => (data?.seances ?? []).filter(s => s.date === aujourdhui),
    [data, aujourdhui],
  )

  /**
   * Les films à l'affiche, dans l'ordre de leur prochaine séance. L'API
   * renvoie déjà les séances triées par date puis par heure : le premier
   * passage d'un film est donc le premier qu'on croise.
   */
  const films = useMemo(() => {
    const parId = new Map((data?.films ?? []).map(f => [f.id, f]))
    const vus = new Set<string>()
    const out: { film: Film; heures: Seance[] }[] = []
    for (const s of data?.seances ?? []) {
      if (vus.has(s.film_id)) { out.find(x => x.film.id === s.film_id)?.heures.push(s); continue }
      const f = parId.get(s.film_id)
      if (!f) continue
      vus.add(s.film_id)
      out.push({ film: f, heures: [s] })
    }
    return out
  }, [data])

  // Réglage de visibilité — masqué l'emporte sur tout, y compris pour un admin.
  if (data) {
    if (data.villageVisibilite === 'masque') return null
    if (data.villageVisibilite === 'admin' && !isAdmin) return null
  }
  // Et rien du tout s'il n'y a aucun film à l'affiche.
  if (!data || films.length === 0) return null

  // Une seule salle joue : on ouvre directement sa programmation. Plusieurs :
  // l'accueil cinéma, qui les présentera toutes.
  const seule = data.cinemas.length === 1 ? data.cinemas[0] : null
  const lien = seule ? `/cinema?cinema=${seule.slug ?? seule.id}` : '/cinema'

  return (
    <>
      {/* Rubrique OUVERTE et non carte fermée : le cinéma est une section du
          flux, au même rang que « Nos rubriques » ou « Le fil du village ».

          `pcv-bh` est le titrage commun des rubriques de la version
          ordinateur — filet noir sous le titre, sous-titre, lien à droite
          (desktop-village.css). Il n'existe qu'au-dessus de 1024 px : sur
          téléphone, ce sont les classes Tailwind qui portent la mise en
          page, exactement comme avant. Le cinéma cesse ainsi d'être la
          seule rubrique titrée autrement que les autres. */}
      <div className="pcv-bh flex items-baseline justify-between gap-2.5 px-4 pb-2.5 pt-[18px]">
        <div>
          <h2 className="m-0 font-serif text-[20px] leading-[1.15] text-texte" style={{ letterSpacing: '-0.02em' }}>Au cinéma</h2>
          {/* Le sous-titre n'apparaît que sur ordinateur : sur un téléphone,
              la ligne de comptage sous les affiches dit déjà tout. */}
          <div className="pcv-sub pcv-only">Ce qu&apos;on joue en ce moment près de chez vous</div>
        </div>
        <Link href={lien} className="pcv-more flex shrink-0 items-center gap-1 text-[12.5px] font-bold no-underline" style={{ color: '#C84B2F' }}>
          Voir tout
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" /><polyline points="13 6 19 12 13 18" />
          </svg>
        </Link>
      </div>

      {/* Les affiches seules. Pas de bandeau de titre dessous : le titre est
          déjà imprimé sur l'affiche. Il ne réapparaît qu'en repli, quand il
          n'y a pas d'image. */}
      <div className="pcv-cineCarrousel" style={{ ['--pcv-n' as string]: films.length }}>
      <div className="pcv-cinePiste flex items-start gap-2.5 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
        {[...films, ...films].map(({ film }, i) => {
          const copie = i >= films.length
          return (
          <Link key={`${film.id}-${i}`} href={`/cinema/film/${film.id}`}
            className={`pcv-cineAff block shrink-0 overflow-hidden rounded-[12px] no-underline${copie ? ' pcv-cineDup' : ''}`}
            aria-hidden={copie} tabIndex={copie ? -1 : undefined}
            style={{ width: 88, boxShadow: '0 2px 8px rgba(44,28,16,.14)' }}>
            {/* `display:block` obligatoire : sur un span inline, `aspect-ratio`
                ne s'applique pas et la vignette s'écrase. 27/40 = les vraies
                proportions d'une affiche, pas du 2:3. */}
            <span className="relative block w-full"
              style={{ aspectRatio: '27 / 40', background: 'linear-gradient(160deg,#2A2320,#0F0D0C)' }}>
              {film.affiche_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={film.affiche_url} alt={film.titre} className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <span className="flex h-full w-full items-end p-1.5">
                  <span style={{ fontSize: 9.5, fontWeight: 800, lineHeight: 1.15, color: '#F4E7CE', textShadow: '0 1px 3px rgba(0,0,0,.6)' }}>
                    {film.titre}
                  </span>
                </span>
              )}
            </span>
          </Link>
          )
        })}
      </div>
      </div>

      {/* Le comptage passe SOUS les affiches, en petit : c'est une précision,
          pas une accroche. */}
      <p className="m-0 px-4 pt-1.5 text-[11.5px]" style={{ color: '#7A6A5A' }}>
        {films.length} film{films.length > 1 ? 's' : ''} à l’affiche
        {seancesDuJour.length > 0 && ` · ${seancesDuJour.length} séance${seancesDuJour.length > 1 ? 's' : ''} aujourd’hui`}
        {data.cinemas.length > 1 ? ` · ${data.cinemas.length} salles` : ''}
      </p>
    </>
  )
}
