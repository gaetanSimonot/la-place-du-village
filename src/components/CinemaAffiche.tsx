'use client'
import { useMemo } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
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
  const { data } = useSWR<Payload>('/api/cinema/affiche', fetcher, { revalidateOnFocus: false })

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
    <div className="mx-4 mt-3.5 overflow-hidden rounded-[20px] bg-white" style={{ border: '1px solid #EDE8E0' }}>
      <Link href={lien} className="flex items-center gap-[10px] px-[15px] pb-2.5 pt-3 no-underline">
        <span className="shrink-0 text-texte">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 8h18v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
            <path d="M3 8l2.5-4 4 2M9 6l4.5-2.5 4 2M15 4l4.5-1.5L21 6" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-title text-[16.5px] leading-tight text-texte">Au cinéma</div>
          <div className="mt-[2px] text-[11px] text-texte-doux">
            {films.length} film{films.length > 1 ? 's' : ''} à l’affiche
            {seancesDuJour.length > 0 && ` · ${seancesDuJour.length} séance${seancesDuJour.length > 1 ? 's' : ''} aujourd’hui`}
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

      {/* Affiches seules. Ni titre, ni horaire : le bloc annonce qu'il se
          passe quelque chose au cinéma et renvoie à la programmation — les
          détails sont à un tap, ils n'ont pas à encombrer l'accueil. */}
      <div className="flex gap-2 overflow-x-auto px-[15px] pb-[15px]" style={{ scrollbarWidth: 'none' }}>
        {films.map(({ film }) => (
          <Link key={film.id} href={`/cinema/film/${film.id}`} className="shrink-0 no-underline">
            <div className="relative overflow-hidden rounded-[10px]"
              style={{ width: 76, aspectRatio: '2 / 3', background: 'linear-gradient(160deg,#2A2320,#0F0D0C)' }}>
              {film.affiche_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={film.affiche_url} alt={film.titre} className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <div className="flex h-full w-full items-end p-1.5">
                  <span style={{ fontSize: 9.5, fontWeight: 800, lineHeight: 1.15, color: '#F4E7CE', textShadow: '0 1px 3px rgba(0,0,0,.6)' }}>
                    {film.titre}
                  </span>
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
