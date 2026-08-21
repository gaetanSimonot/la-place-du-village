'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import useSWR from 'swr'
import BottomNavBar from '@/components/BottomNavBar'
import { formatHeure, type Cinema, type Film, type Seance } from '@/lib/cinema'

/**
 * Expérience cinéma publique. Aucune authentification, aucune condition :
 * c'est la page que vise le QR code du hall.
 *
 * La bottom nav de l'app reste en place, comme sur tous les autres écrans —
 * le cinéma est une rubrique de La Place du Village, pas une application à
 * part.
 */

interface Payload {
  cinemas: { id: string; nom: string; commune: string | null; slug: string | null }[]
  cinema: Cinema | null
  films: Film[]
  seances: Seance[]
  evenements: { id: string; titre: string; date_debut: string; heure: string | null; image_url: string | null }[]
  aujourdhui: string
}

type Onglet = 'affiche' | 'aujourdhui' | 'semaine' | 'prochainement'
const ONGLETS: { id: Onglet; label: string }[] = [
  { id: 'affiche',       label: "À l'affiche" },
  { id: 'aujourdhui',    label: 'Aujourd’hui' },
  { id: 'semaine',       label: 'Cette semaine' },
  { id: 'prochainement', label: 'Prochainement' },
]

const fetcher = (u: string) => fetch(u).then(r => r.json())

function jourLisible(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  const s = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long',
  }).format(d)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Affiche 2:3 avec repli typographique quand aucune image n'est fournie. */
function Affiche({ film, largeur = 104 }: { film: Film; largeur?: number }) {
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-[10px]"
      style={{ width: largeur, aspectRatio: '2 / 3', background: 'linear-gradient(160deg,#2A2320,#0F0D0C)' }}
    >
      {film.affiche_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={film.affiche_url} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-end p-2">
          <span style={{ fontSize: 10.5, fontWeight: 800, lineHeight: 1.15, color: '#F4E7CE', textShadow: '0 1px 3px rgba(0,0,0,.6)' }}>
            {film.titre}
          </span>
        </div>
      )}
    </div>
  )
}

export default function CinemaClient() {
  const router = useRouter()
  const [slug, setSlug] = useState<string | null>(null)
  const [onglet, setOnglet] = useState<Onglet>('affiche')

  // Lecture directe de l'URL : useSearchParams() ferait basculer la page en
  // rendu client complet (piège documenté sur ce projet).
  useEffect(() => {
    try { setSlug(new URLSearchParams(window.location.search).get('cinema')) } catch { /* noop */ }
  }, [])

  const { data, isLoading } = useSWR<Payload>(
    `/api/cinema${slug ? `?cinema=${encodeURIComponent(slug)}` : ''}`, fetcher,
  )

  const films = useMemo(() => new Map((data?.films ?? []).map(f => [f.id, f])), [data])
  // useMemo : sans lui, `?? []` produit un tableau neuf à chaque rendu et
  // relance tous les calculs qui en dépendent.
  const seances = useMemo(() => data?.seances ?? [], [data])
  const aujourdhui = data?.aujourdhui ?? ''
  const finSemaine = useMemo(() => {
    if (!aujourdhui) return ''
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date(Date.parse(`${aujourdhui}T12:00:00Z`) + 6 * 86_400_000))
  }, [aujourdhui])

  /** Séances retenues par l'onglet courant. */
  const seancesVisibles = useMemo(() => {
    if (onglet === 'aujourdhui') return seances.filter(s => s.date === aujourdhui)
    if (onglet === 'semaine')    return seances.filter(s => s.date >= aujourdhui && s.date <= finSemaine)
    if (onglet === 'prochainement') return seances.filter(s => s.date > finSemaine)
    return seances
  }, [seances, onglet, aujourdhui, finSemaine])

  /** Films de l'onglet, dans l'ordre de leur prochaine séance. */
  const filmsVisibles = useMemo(() => {
    const vus = new Set<string>()
    const out: Film[] = []
    for (const s of seancesVisibles) {
      if (vus.has(s.film_id)) continue
      const f = films.get(s.film_id)
      if (f) { vus.add(s.film_id); out.push(f) }
    }
    return out
  }, [seancesVisibles, films])

  /** Séances groupées par jour, pour l'affichage en lignes. */
  const parJour = useMemo(() => {
    const m = new Map<string, Seance[]>()
    for (const s of seancesVisibles) {
      const l = m.get(s.date) ?? []
      l.push(s)
      m.set(s.date, l)
    }
    return Array.from(m.entries())
  }, [seancesVisibles])

  const cinema = data?.cinema ?? null

  return (
    <div className="relative min-h-[100dvh] bg-creme pb-28 font-inter text-texte">
      {/* En-tête : retour, nom de la salle, ville */}
      <div
        className="flex items-center gap-[11px] bg-white px-3.5 py-2.5"
        style={{ borderBottom: '1px solid #F0EAE0', paddingTop: 'max(10px, env(safe-area-inset-top, 10px))' }}
      >
        <button
          onClick={() => router.back()}
          aria-label="Retour"
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-white"
          style={{ border: '1px solid #E8E0D4' }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-title text-[17px] leading-tight">{cinema?.nom ?? 'Au cinéma'}</div>
          {cinema?.commune && <div className="text-[11.5px] text-texte-doux">{cinema.commune}</div>}
        </div>
        {cinema?.billetterie_url && (
          <a
            href={cinema.billetterie_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-[30px] shrink-0 items-center rounded-[8px] px-2.5 text-[11px] font-extrabold no-underline"
            style={{ background: '#1A1209', color: '#E8C58A' }}
          >
            Billetterie
          </a>
        )}
      </div>

      {/* Onglets — une seule ligne, défilement horizontal si nécessaire */}
      <div
        className="flex gap-4 overflow-x-auto px-4"
        style={{ borderBottom: '1px solid #F0EAE0', scrollbarWidth: 'none' }}
      >
        {ONGLETS.map(o => {
          const actif = o.id === onglet
          return (
            <button
              key={o.id}
              onClick={() => setOnglet(o.id)}
              className="shrink-0 whitespace-nowrap bg-transparent px-0"
              style={{
                padding: '11px 0',
                fontSize: 13,
                fontWeight: actif ? 700 : 600,
                color: actif ? '#C84B2F' : '#7A6A5A',
                border: 'none',
                borderBottom: `2.5px solid ${actif ? '#C84B2F' : 'transparent'}`,
              }}
            >
              {o.label}
            </button>
          )
        })}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-bord border-t-primary" />
        </div>
      ) : !cinema ? (
        <EtatVide
          titre="Pas encore de cinéma"
          texte="Aucune salle n’a encore rejoint La Place du Village."
        />
      ) : (
        <>
          {/* Rail d'affiches */}
          {filmsVisibles.length > 0 && (
            <div className="pt-4">
              <div className="flex items-baseline justify-between px-4 pb-2">
                <h2 className="m-0 font-title text-[20px] leading-tight">
                  {ONGLETS.find(o => o.id === onglet)?.label}
                </h2>
                <span className="text-[11px] font-bold text-texte-doux">
                  {filmsVisibles.length} film{filmsVisibles.length > 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex gap-2.5 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
                {filmsVisibles.map(f => (
                  <Link key={f.id} href={`/cinema/film/${f.id}`} className="w-[104px] shrink-0 no-underline">
                    <Affiche film={f} />
                    <div className="line-clamp-2 text-texte" style={{ marginTop: 8, fontSize: 12.5, fontWeight: 700, lineHeight: 1.25, letterSpacing: '-.01em' }}>{f.titre}</div>
                    {f.duree_min ? <div className="mt-1 text-[11px] text-texte-doux">{f.duree_min} min</div> : null}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Séances, en lignes groupées par jour */}
          {parJour.length === 0 ? (
            <EtatVide
              titre="Aucune séance"
              texte={onglet === 'aujourdhui'
                ? 'Rien à l’affiche aujourd’hui. Regardez « Cette semaine ».'
                : 'Le programme n’est pas encore publié.'}
            />
          ) : (
            /* Encadré unique, bandeaux de jour à l'intérieur — .sBox de la maquette */
            <div className="overflow-hidden rounded-[16px] bg-white" style={{ margin: '16px 16px 0', border: '1px solid #F0EAE0' }}>
              {parJour.map(([date, liste]) => (
                <div key={date}>
                  <div style={{ padding: '11px 14px', fontSize: 12.5, fontWeight: 700, color: '#1A1209', background: '#F7F1E6', borderBottom: '1px solid #F0EAE0' }}>
                    {jourLisible(date)}
                  </div>
                  {liste.map(s => {
                    const f = films.get(s.film_id)
                    const lien = s.billetterie_url || cinema.billetterie_url
                    return (
                      <div key={s.id} className="flex items-center gap-[11px]" style={{ padding: '12px 14px', borderBottom: '1px solid #F0EAE0' }}>
                        {/* Billet — repère visuel de la maquette */}
                        <span className="flex-none" style={{ color: '#C84B2F', opacity: 0.85 }}>
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-4z" />
                            <line x1="9" y1="7" x2="9" y2="17" strokeDasharray="2 2" />
                          </svg>
                        </span>
                        <span className="flex-none font-title tabular-nums" style={{ fontSize: 15 }}>{formatHeure(s.heure)}</span>
                        <div className="min-w-0 flex-1">
                          <Link href={`/cinema/film/${s.film_id}`} className="block truncate text-texte no-underline" style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-.01em' }}>
                            {f?.titre ?? 'Film'}
                          </Link>
                          <div style={{ fontSize: 11, color: '#7A6A5A', marginTop: 2 }}>
                            {s.version.toUpperCase()}{f?.duree_min ? ` · ${f.duree_min} min` : ''}{s.salle ? ` · ${s.salle}` : ''}
                            {s.note ? ` · ${s.note}` : ''}
                          </div>
                        </div>
                        {lien && (
                          <a href={lien} target="_blank" rel="noopener noreferrer" className="flex-none no-underline"
                            style={{ border: '1px solid #CFE3D5', background: '#F4FAF5', borderRadius: 9, padding: '7px 12px', fontSize: 12, fontWeight: 700, color: '#2D5A3D' }}>
                            Réserver
                          </a>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}

          {/* Événements du cinéma — eux vivent aussi dans l'agenda du village */}
          {(data?.evenements?.length ?? 0) > 0 && (
            <div className="px-4 pt-2">
              <h2 className="m-0 mb-2 font-title text-[20px] leading-tight">Événements au cinéma</h2>
              <div className="flex flex-col gap-2">
                {data!.evenements.map(e => (
                  <Link
                    key={e.id}
                    href={`/evenement/${e.id}`}
                    className="flex items-center gap-3 rounded-[12px] bg-white px-3 py-2.5 no-underline"
                    style={{ border: '1px solid #F0EAE0' }}
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
                      style={{ background: '#FFF0E5', color: '#C84B2F' }}
                    >
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-bold text-texte">{e.titre}</div>
                      <div className="text-[11px] text-texte-doux">
                        {jourLisible(e.date_debut)}{e.heure ? ` · ${formatHeure(e.heure)}` : ''}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <BottomNavBar />
    </div>
  )
}

function EtatVide({ titre, texte }: { titre: string; texte: string }) {
  return (
    <div className="mx-4 mt-6 rounded-[14px] bg-white p-6 text-center" style={{ border: '1px solid #F0EAE0' }}>
      <p className="m-0 mb-1 text-[14px] font-extrabold text-texte">{titre}</p>
      <p className="m-0 text-[12px] text-texte-doux">{texte}</p>
    </div>
  )
}
