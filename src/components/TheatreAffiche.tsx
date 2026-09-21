'use client'
import { useMemo } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { useTerritoire } from '@/components/TerritoireProvider'
import {
  heureLisible, representationsPubliques,
  type Theatre, type Spectacle, type Representation, type VisibiliteTheatre,
} from '@/lib/theatre'

/**
 * Bloc « Au théâtre » — une rubrique insérée dans le flux du Village.
 *
 * Jumeau de `CinemaAffiche`, avec une différence qui tient au métier : le
 * cinéma annonce l'affiche de la semaine, le théâtre annonce LES PROCHAINES
 * DATES. Une salle de village joue dix fois par saison ; montrer « ce qu'on
 * joue en ce moment » n'aurait aucun sens la plupart des semaines, alors que
 * « le prochain spectacle est dans onze jours » en a toujours un.
 *
 * Le bloc **disparaît entièrement** quand plus rien n'est annoncé — jamais de
 * carte vide. Une saison finie ne laisse pas de cadre.
 *
 * Visibilité : trois états réglés depuis l'admin, sans déploiement. C'est le
 * composant qui décide, pas son appelant, pour qu'il n'y ait qu'un seul
 * endroit à regarder.
 */

interface Payload {
  theatres: Theatre[]
  spectacles: Spectacle[]
  representations: Representation[]
  aujourdhui: string
  villageVisibilite: VisibiliteTheatre
}

const fetcher = async (u: string) => {
  const r = await fetch(u)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

const MOIS = ['janv.', 'févr.', 'mars', 'avril', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

/** « 2026-12-15 » → « 15 déc. ». Midi UTC : le fuseau ne décale rien. */
function jourCourt(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`)
  return `${d.getUTCDate()} ${MOIS[d.getUTCMonth()]}`
}

export default function TheatreAffiche({ isAdmin = false }: { isAdmin?: boolean }) {
  const { territoire } = useTerritoire()
  const slugTerr = territoire?.slug ?? null
  const { data } = useSWR<Payload>(
    slugTerr ? `/api/theatre?territoire=${encodeURIComponent(slugTerr)}` : '/api/theatre',
    fetcher, { revalidateOnFocus: false })

  /**
   * Les prochains spectacles, dans l'ordre de leur prochaine date.
   *
   * L'API renvoie déjà les représentations triées : la première rencontre
   * d'un spectacle est donc bien sa prochaine date. Les séances scolaires
   * sont écartées — on ne peut pas y venir, elles n'ont rien à faire dans
   * une accroche.
   */
  const prochains = useMemo(() => {
    const parId = new Map((data?.spectacles ?? []).map(s => [s.id, s]))
    const vus = new Set<string>()
    const out: { spectacle: Spectacle; date: Representation }[] = []
    for (const r of representationsPubliques(data?.representations ?? [])) {
      if (vus.has(r.spectacle_id)) continue
      const s = parId.get(r.spectacle_id)
      if (!s) continue
      vus.add(r.spectacle_id)
      out.push({ spectacle: s, date: r })
    }
    return out.slice(0, 12)
  }, [data])

  // Réglage de visibilité — masqué l'emporte sur tout, y compris pour un admin.
  if (data) {
    if (data.villageVisibilite === 'masque') return null
    if (data.villageVisibilite === 'admin' && !isAdmin) return null
  }
  // Et rien du tout s'il n'y a aucune date annoncée.
  if (!data || prochains.length === 0) return null

  // Une seule salle : on ouvre directement sa saison. Plusieurs : l'accueil.
  const seule = data.theatres.length === 1 ? data.theatres[0] : null
  const lien = seule ? `/theatre?theatre=${seule.slug ?? seule.id}` : '/theatre'
  const prochaine = prochains[0].date

  return (
    <>
      {/* Rubrique OUVERTE et non carte fermée, au même rang que le cinéma et
          « Le fil du village ». `pcv-bh` est le titrage commun des rubriques
          sur ordinateur ; sur téléphone ce sont les classes Tailwind qui
          portent la mise en page. */}
      <div className="pcv-bh flex items-baseline justify-between gap-2.5 px-4 pb-2.5 pt-[18px]">
        <div>
          <h2 className="m-0 font-serif text-[20px] leading-[1.15] text-texte" style={{ letterSpacing: '-0.02em' }}>
            Au théâtre
          </h2>
          <div className="pcv-sub pcv-only">La saison du spectacle vivant près de chez vous</div>
        </div>
        <Link href={lien} className="pcv-more flex shrink-0 items-center gap-1 text-[12.5px] font-bold no-underline" style={{ color: '#C6332B' }}>
          Voir tout
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" /><polyline points="13 6 19 12 13 18" />
          </svg>
        </Link>
      </div>

      <div className="flex items-start gap-2.5 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
        {prochains.map(({ spectacle: s, date }) => (
          // Le visuel mène à la FICHE du spectacle, pas au module : c'est
          // une affiche, et on clique une affiche pour savoir ce que c'est.
          // « Voir tout » reste la porte du module. Même règle qu'au cinéma.
          <Link key={s.id} href={`/theatre/spectacle/${s.id}`}
            className="block shrink-0 overflow-hidden rounded-[12px] no-underline"
            style={{ width: 118, boxShadow: '0 2px 8px rgba(44,28,16,.14)' }}>
            {/* `display:block` obligatoire : sur un span inline, `aspect-ratio`
                ne s'applique pas et la vignette s'écrase. */}
            <span className="relative block w-full"
              style={{ aspectRatio: '3 / 4', background: 'linear-gradient(160deg,#3A1C1E,#150B0C)' }}>
              {s.affiche_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.affiche_url} alt={s.titre} className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <span className="flex h-full w-full items-end p-2">
                  <span style={{ fontSize: 11, fontWeight: 800, lineHeight: 1.15, color: '#F4E7CE', textShadow: '0 1px 3px rgba(0,0,0,.6)' }}>
                    {s.titre}
                  </span>
                </span>
              )}
              {/* La date par-dessus l'image : c'est l'information qui décide
                  d'y aller, et elle doit se lire sans ouvrir la fiche. */}
              <span className="absolute inset-x-0 bottom-0 px-2 py-1.5"
                style={{ background: 'linear-gradient(to top, rgba(15,10,12,.92), transparent)' }}>
                <span className="block text-[11px] font-extrabold" style={{ color: '#FF8A7E' }}>
                  {jourCourt(date.date)}{heureLisible(date.heure) ? ` · ${heureLisible(date.heure)}` : ''}
                </span>
              </span>
            </span>
          </Link>
        ))}
      </div>

      {/* Le comptage passe SOUS les visuels, en petit : c'est une précision,
          pas une accroche. */}
      <p className="m-0 px-4 pt-1.5 text-[11.5px]" style={{ color: '#7A6A5A' }}>
        Prochaine date le {jourCourt(prochaine.date)}
        {prochaine.lieu ? ` · ${prochaine.lieu}` : ''}
        {data.theatres.length > 1 ? ` · ${data.theatres.length} salles` : ''}
      </p>
    </>
  )
}
