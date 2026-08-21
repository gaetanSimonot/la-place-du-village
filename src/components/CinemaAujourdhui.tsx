'use client'
import { useMemo } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { formatHeure, type Cinema, type Film, type Seance, type VisibiliteCinema } from '@/lib/cinema'

/**
 * Bloc « Au cinéma aujourd'hui » — une carte insérée dans le flux du Village.
 *
 * Ce n'est pas une rubrique : c'est une carte cerclée d'orange qui **disparaît
 * entièrement** s'il n'y a aucune séance aujourd'hui. Un cinéma fermé le mardi
 * ne doit pas laisser un bloc vide sur la page d'accueil.
 *
 * Visibilité : trois états réglés depuis l'admin, sans déploiement — masqué
 * pour tout le monde, visible des seuls admins, ou visible de tous. C'est le
 * composant qui décide, pas son appelant, pour qu'il n'y ait qu'un seul
 * endroit à regarder.
 */

interface Payload {
  /** Salles qui jouent aujourd'hui — pas « la » salle. */
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

export default function CinemaAujourdhui({ isAdmin = false }: { isAdmin?: boolean }) {
  const { data } = useSWR<Payload>('/api/cinema', fetcher, { revalidateOnFocus: false })

  const aujourdhui = data?.aujourdhui ?? ''
  const seancesDuJour = useMemo(
    () => (data?.seances ?? []).filter(s => s.date === aujourdhui),
    [data, aujourdhui],
  )

  /** Films du jour, dans l'ordre de leur première séance. */
  const films = useMemo(() => {
    const parId = new Map((data?.films ?? []).map(f => [f.id, f]))
    const vus = new Set<string>()
    const out: { film: Film; heures: Seance[] }[] = []
    for (const s of seancesDuJour) {
      if (vus.has(s.film_id)) { out.find(x => x.film.id === s.film_id)?.heures.push(s); continue }
      const f = parId.get(s.film_id)
      if (!f) continue
      vus.add(s.film_id)
      out.push({ film: f, heures: [s] })
    }
    return out
  }, [seancesDuJour, data])

  // Réglage de visibilité — masqué l'emporte sur tout, y compris pour un admin.
  if (data) {
    if (data.villageVisibilite === 'masque') return null
    if (data.villageVisibilite === 'admin' && !isAdmin) return null
  }
  // Et rien du tout s'il n'y a aucune séance aujourd'hui.
  if (!data || films.length === 0) return null

  // Heure courante à Paris, pour distinguer la prochaine séance de celles
  // déjà passées : « 14h » à 20h n'intéresse plus personne.
  const maintenant = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date())
  const prochaine = seancesDuJour.find(s => s.heure.slice(0, 5) >= maintenant)

  // Une seule salle joue : on ouvre directement sa programmation. Plusieurs :
  // l'accueil cinéma, qui les présentera toutes.
  const seule = data.cinemas.length === 1 ? data.cinemas[0] : null
  const lien = seule ? `/cinema?cinema=${seule.slug ?? seule.id}` : '/cinema'

  return (
    <div className="mx-4 mt-3.5 overflow-hidden rounded-[20px] bg-white" style={{ border: '1.5px solid #F0B08A' }}>
      <Link href={lien} className="flex items-center gap-[11px] px-[15px] pb-3 pt-[15px] no-underline">
        <span className="shrink-0 text-texte">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 8h18v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
            <path d="M3 8l2.5-4 4 2M9 6l4.5-2.5 4 2M15 4l4.5-1.5L21 6" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-title text-[18px] leading-tight text-texte">Au cinéma aujourd’hui</div>
          <div className="mt-[3px] text-[11.5px] text-texte-doux">
            {films.length} film{films.length > 1 ? 's' : ''} · {seancesDuJour.length} séance{seancesDuJour.length > 1 ? 's' : ''}
            {data.cinemas.length > 1 ? ` · ${data.cinemas.length} salles` : ''}
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-[12.5px] font-bold" style={{ color: '#C84B2F' }}>
          Tout voir
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" /><polyline points="13 6 19 12 13 18" />
          </svg>
        </span>
      </Link>

      <div className="flex gap-2.5 overflow-x-auto px-[15px] pb-4" style={{ scrollbarWidth: 'none' }}>
        {films.map(({ film, heures }) => (
          <Link key={film.id} href={`/cinema/film/${film.id}`} className="w-[92px] shrink-0 no-underline">
            <div className="relative overflow-hidden rounded-[10px]" style={{ width: 92, aspectRatio: '2 / 3', background: '#241C15' }}>
              {film.affiche_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={film.affiche_url} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <div className="flex h-full w-full items-end p-1.5">
                  <span className="text-[10px] font-extrabold leading-tight text-[#E8C58A]">{film.titre}</span>
                </div>
              )}
            </div>
            <div className="mt-1.5 line-clamp-2 text-[11.5px] font-bold leading-tight text-texte">{film.titre}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {heures.slice(0, 3).map(s => {
                const suivante = prochaine?.id === s.id
                return (
                  <span key={s.id}
                    className="rounded-[7px] px-2 py-[3px] text-[11px] font-bold tabular-nums"
                    style={suivante
                      ? { background: '#2D5A3D', color: '#fff' }
                      : { background: '#EAF3EC', color: '#2D5A3D' }}>
                    {formatHeure(s.heure)}
                  </span>
                )
              })}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
