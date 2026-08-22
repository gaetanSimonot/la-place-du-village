'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import useSWR from 'swr'
import BottomNavBar from '@/components/BottomNavBar'
import { formatHeure, type Cinema, type Film, type Seance } from '@/lib/cinema'

/**
 * UNIVERS CINÉMA — public, sans compte.
 *
 * Entrer ici fait basculer TOUTE l'app en bleu nuit, bottom nav comprise : on
 * doit sentir qu'on est ailleurs le temps d'un instant. Le thème est posé sur
 * <html> au montage et retiré au démontage — il ne peut donc pas fuir sur le
 * reste de l'app, même si on sort par le bouton retour du système.
 *
 * On ne touche pas à la structure : la bottom nav reste celle de l'app, mêmes
 * onglets, mêmes libellés. Seul son habillage change, par variables CSS. La
 * sortie se fait par la barre du haut, « La Place du Village ».
 */

interface Evenement {
  id: string; titre: string; date_debut: string
  heure: string | null; image_url: string | null
  categorie: string | null
  /** Sous-libellé libre — « ciné-débat ». Préféré à la catégorie quand il existe. */
  categorie_libre: string | null
}
interface Payload {
  cinemas: { id: string; nom: string; commune: string | null; slug: string | null }[]
  cinema: Cinema | null
  films: Film[]
  seances: Seance[]
  evenements: Evenement[]
  aujourdhui: string
}

type Onglet = 'films' | 'programme' | 'evenements'
const ONGLETS: { id: Onglet; label: string }[] = [
  { id: 'films',      label: 'Films' },
  { id: 'programme',  label: 'Programme' },
  { id: 'evenements', label: 'Événements' },
]

const fetcher = (u: string) => fetch(u).then(r => r.json())

function jourLong(date: string): string {
  const s = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date(`${date}T12:00:00Z`))
  return s.charAt(0).toUpperCase() + s.slice(1)
}
function jourCourt(date: string) {
  const d = new Date(`${date}T12:00:00Z`)
  return {
    nom: new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short' }).format(d).replace('.', ''),
    num: new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric' }).format(d),
  }
}

/** Affiche 2:3, avec repli typographique quand elle n'est pas renseignée. */
function Affiche({ film, largeur }: { film: Film; largeur: number }) {
  return (
    <div className="relative shrink-0 overflow-hidden"
      style={{
        width: largeur, aspectRatio: '2 / 3', borderRadius: 10,
        background: 'linear-gradient(160deg,#1E2C3A,#0E1318)',
        border: '1px solid rgba(157,207,238,.14)',
      }}>
      {film.affiche_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={film.affiche_url} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span className="absolute bottom-2 left-2 right-2 line-clamp-3"
          style={{ fontSize: 10, fontWeight: 700, lineHeight: 1.2, color: 'rgba(250,251,250,.72)' }}>
          {film.titre}
        </span>
      )}
    </div>
  )
}

export default function CinemaClient() {
  const router = useRouter()
  const [slug, setSlug] = useState<string | null>(null)
  const [onglet, setOnglet] = useState<Onglet>('films')
  const [jour, setJour] = useState<string | null>(null)

  // Lecture directe de l'URL : useSearchParams() ferait basculer la page en
  // rendu client complet (piège documenté sur ce projet).
  useEffect(() => {
    try { setSlug(new URLSearchParams(window.location.search).get('cinema')) } catch { /* noop */ }
  }, [])

  // Le thème vit tant qu'on est sur cette page, et pas une seconde de plus.
  useEffect(() => {
    document.documentElement.dataset.univers = 'cinema'
    return () => { delete document.documentElement.dataset.univers }
  }, [])

  const { data, isLoading } = useSWR<Payload>(
    `/api/cinema${slug ? `?cinema=${encodeURIComponent(slug)}` : ''}`, fetcher,
  )

  const cinema = data?.cinema ?? null
  const filmsParId = useMemo(() => new Map((data?.films ?? []).map(f => [f.id, f])), [data])
  const seances = useMemo(() => data?.seances ?? [], [data])
  const aujourdhui = data?.aujourdhui ?? ''

  /** Les 7 prochains jours, pour le bandeau de l'onglet Programme. */
  const semaine = useMemo(() => {
    if (!aujourdhui) return []
    const base = Date.parse(`${aujourdhui}T12:00:00Z`)
    return Array.from({ length: 7 }, (_, i) =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })
        .format(new Date(base + i * 86_400_000)))
  }, [aujourdhui])

  const filmsAffiche = useMemo(() => {
    const vus = new Set<string>(); const out: Film[] = []
    for (const s of seances) {
      if (vus.has(s.film_id)) continue
      const f = filmsParId.get(s.film_id)
      if (f) { vus.add(s.film_id); out.push(f) }
    }
    return out
  }, [seances, filmsParId])

  const seancesDuJour = useMemo(() => seances.filter(s => s.date === aujourdhui), [seances, aujourdhui])

  /** Programmation groupée par jour, selon l'onglet et le jour retenu. */
  const parJour = useMemo(() => {
    const source = onglet === 'programme' && jour ? seances.filter(s => s.date === jour) : seances
    const m = new Map<string, Seance[]>()
    for (const s of source) { const l = m.get(s.date) ?? []; l.push(s); m.set(s.date, l) }
    return Array.from(m.entries())
  }, [seances, onglet, jour])

  const billetterie = cinema?.billetterie_url ?? null

  return (
    <div className="relative min-h-[100dvh] font-inter"
      style={{ background: 'var(--cine-bg)', color: 'var(--cine-ink)', paddingBottom: 92 }}>

      {/* Barre de sortie — la porte de retour vers l'app */}
      <div className="flex items-center gap-2.5 px-3.5"
        style={{ paddingTop: 'max(16px, env(safe-area-inset-top, 16px))', paddingBottom: 6 }}>
        <button
          onClick={() => router.push('/?tab=village')}
          aria-label="Revenir à La Place du Village"
          className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full"
          style={{ border: '1px solid var(--cine-line)', background: 'rgba(250,251,250,.05)', color: 'var(--cine-ink)' }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <button onClick={() => router.push('/?tab=village')}
          className="min-w-0 truncate border-none bg-transparent p-0 text-left"
          style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-.01em', color: 'var(--cine-ink)' }}>
          La Place du Village
        </button>
        {billetterie && (
          <a href={billetterie} target="_blank" rel="noopener noreferrer"
            className="ml-auto flex-none rounded-full no-underline"
            style={{ border: '1px solid var(--cine-accent)', padding: '7px 13px', fontSize: 12, fontWeight: 700, color: 'var(--cine-accent)' }}>
            Billetterie
          </a>
        )}
      </div>

      {/* Enseigne */}
      <div className="flex items-center justify-center" style={{ padding: '16px 26px 24px' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/cinema/aec-logo.png" alt={cinema?.nom ?? 'Cinéma'}
          style={{ width: '100%', maxWidth: 270, height: 'auto', display: 'block' }} />
      </div>

      {/* Onglets centrés */}
      <div className="flex justify-center gap-7 px-4" style={{ borderBottom: '1px solid var(--cine-line)' }}>
        {ONGLETS.map(o => {
          const actif = o.id === onglet
          return (
            <button key={o.id} onClick={() => setOnglet(o.id)}
              className="flex-none whitespace-nowrap bg-transparent"
              style={{
                border: 'none', borderBottom: `2px solid ${actif ? 'var(--cine-accent)' : 'transparent'}`,
                padding: '11px 0 10px', fontSize: 13.5,
                fontWeight: actif ? 700 : 600,
                color: actif ? 'var(--cine-accent2)' : 'var(--cine-dim)',
              }}>
              {o.label}
            </button>
          )
        })}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-7 w-7 animate-spin rounded-full"
            style={{ border: '3px solid rgba(157,207,238,.2)', borderTopColor: 'var(--cine-accent)' }} />
        </div>
      ) : !cinema ? (
        <Vide texte="Aucune salle n’a encore rejoint La Place du Village." />
      ) : onglet === 'films' ? (
        <>
          <Titre texte="À l'affiche" compteur={filmsAffiche.length} />
          {filmsAffiche.length === 0 ? (
            <Vide texte="Le programme n’est pas encore publié." />
          ) : (
            <div className="flex gap-3 overflow-x-auto px-[18px] pb-1.5" style={{ scrollbarWidth: 'none' }}>
              {filmsAffiche.map(f => (
                <Link key={f.id} href={`/cinema/film/${f.id}`} className="w-[118px] flex-none no-underline">
                  <Affiche film={f} largeur={118} />
                  <div className="line-clamp-2"
                    style={{ marginTop: 9, fontSize: 13, fontWeight: 600, lineHeight: 1.3, letterSpacing: '-.01em', color: 'var(--cine-ink)' }}>
                    {f.titre}
                  </div>
                  {f.duree_min ? <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--cine-dim2)' }}>{f.duree_min} min</div> : null}
                </Link>
              ))}
            </div>
          )}

          {seancesDuJour.length > 0 && (
            <>
              <Titre texte="Aujourd'hui" compteur={seancesDuJour.length} />
              <ListeSeances jour={aujourdhui} liste={seancesDuJour} films={filmsParId} billetterie={billetterie} sansBandeau />
            </>
          )}
        </>
      ) : onglet === 'programme' ? (
        <>
          {/* Bandeau des 7 jours à venir */}
          <div className="flex gap-[7px] overflow-x-auto" style={{ padding: '14px 18px 4px', scrollbarWidth: 'none' }}>
            {semaine.map(d => {
              const { nom, num } = jourCourt(d)
              const actif = (jour ?? aujourdhui) === d
              const n = seances.filter(s => s.date === d).length
              return (
                <button key={d} onClick={() => setJour(d)}
                  className="flex-none text-center"
                  style={{
                    width: 46, borderRadius: 11, padding: '8px 0 9px',
                    background: actif ? 'rgba(157,207,238,.14)' : 'rgba(250,251,250,.04)',
                    border: `1px solid ${actif ? 'var(--cine-accent)' : 'rgba(250,251,250,.06)'}`,
                    color: actif ? 'var(--cine-accent2)' : 'var(--cine-ink)',
                    // Un jour sans séance reste cliquable mais s'efface : on ne
                    // fait pas croire qu'il se passe quelque chose.
                    opacity: n === 0 ? 0.45 : 1,
                  }}>
                  <span style={{ display: 'block', fontSize: 9.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: actif ? 'rgba(157,207,238,.6)' : 'var(--cine-dim2)' }}>{nom}</span>
                  <b className="font-title" style={{ display: 'block', fontSize: 17, lineHeight: 1.1, marginTop: 2, fontWeight: 700 }}>{num}</b>
                </button>
              )
            })}
          </div>

          {parJour.length === 0 ? (
            <Vide texte="Aucune séance ce jour-là." />
          ) : parJour.map(([d, liste]) => (
            <ListeSeances key={d} jour={d} liste={liste} films={filmsParId} billetterie={billetterie} />
          ))}

          {jour && (
            <button onClick={() => setJour(null)}
              className="block w-full border-none"
              style={{ borderTop: '1px solid var(--cine-line)', background: 'rgba(157,207,238,.06)', padding: 13, fontSize: 12.5, fontWeight: 700, color: 'var(--cine-accent)' }}>
              Voir toute la programmation
            </button>
          )}
        </>
      ) : (
        <Evenements liste={data?.evenements ?? []} />
      )}

      <BottomNavBar />
    </div>
  )
}

/* ─── Briques ─────────────────────────────────────────────────────────── */

function Titre({ texte, compteur }: { texte: string; compteur?: number }) {
  return (
    <div className="flex items-baseline justify-between" style={{ padding: '18px 18px 10px' }}>
      <h2 className="m-0 font-title" style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-.01em', color: 'var(--cine-ink)' }}>{texte}</h2>
      {typeof compteur === 'number' && (
        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--cine-dim2)' }}>{compteur}</span>
      )}
    </div>
  )
}

function Vide({ texte }: { texte: string }) {
  return <p className="px-[18px] py-10 text-center" style={{ fontSize: 12.5, color: 'var(--cine-dim)' }}>{texte}</p>
}

/**
 * Liste de séances, bord à bord. Pas d'encadré arrondi : la maquette veut des
 * lignes qui filent d'un bord à l'autre, la colonne d'heure séparée par un
 * filet vertical, et pas de séparateur sous la dernière.
 */
function ListeSeances({ jour, liste, films, billetterie, sansBandeau }: {
  jour: string
  liste: Seance[]
  films: Map<string, Film>
  billetterie: string | null
  sansBandeau?: boolean
}) {
  return (
    <div>
      {!sansBandeau && (
        <div className="flex items-center justify-between gap-2"
          style={{ padding: '9px 18px', fontSize: 11.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--cine-accent)', background: 'var(--cine-band)', borderBottom: '1px solid var(--cine-line)' }}>
          <span>{jourLong(jour)}</span>
          <em style={{ fontStyle: 'normal', fontWeight: 700, letterSpacing: '.02em', textTransform: 'none', color: 'var(--cine-dim2)', fontSize: 11 }}>
            {liste.length} séance{liste.length > 1 ? 's' : ''}
          </em>
        </div>
      )}
      {liste.map((s, i) => {
        const f = films.get(s.film_id)
        const lien = s.billetterie_url || billetterie
        return (
          <div key={s.id} className="flex items-center gap-[13px]"
            style={{ padding: '11px 18px', borderBottom: i === liste.length - 1 ? 'none' : '1px solid rgba(250,251,250,.07)' }}>
            <span className="flex-none font-title tabular-nums"
              style={{ width: 50, paddingRight: 13, borderRight: '1px solid rgba(250,251,250,.12)', fontSize: 15, fontWeight: 800, color: 'var(--cine-accent2)' }}>
              {formatHeure(s.heure)}
            </span>
            <div className="min-w-0 flex-1">
              <Link href={`/cinema/film/${s.film_id}`} className="block truncate no-underline"
                style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: '-.01em', color: 'var(--cine-ink)' }}>
                {f?.titre ?? 'Film'}
              </Link>
              <div style={{ marginTop: 2, fontSize: 11, color: 'var(--cine-dim2)' }}>
                {[s.version.toUpperCase(), f?.duree_min ? `${f.duree_min} min` : null, s.salle, s.note].filter(Boolean).join(' · ')}
              </div>
            </div>
            {lien && (
              <a href={lien} target="_blank" rel="noopener noreferrer" className="flex-none no-underline"
                style={{ border: '1px solid rgba(157,207,238,.45)', borderRadius: 7, padding: '6px 11px', fontSize: 11.5, fontWeight: 700, color: 'var(--cine-accent2)' }}>
                Réserver
              </a>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Événements du cinéma. Ce sont des événements de l'agenda du village, pas des
 * séances : même modèle de données, et ils apparaissent donc aussi ailleurs
 * dans l'app. Pas de doublon de modèle.
 */
function Evenements({ liste }: { liste: Evenement[] }) {
  const [cat, setCat] = useState<string>('tout')
  const cats = useMemo(() => {
    // Le libellé libre prime : « ciné-débat » dit mieux que « autre ».
    const s = new Set(liste.map(e => e.categorie_libre || e.categorie).filter(Boolean) as string[])
    return ['tout', ...Array.from(s)]
  }, [liste])
  const filtres = cat === 'tout' ? liste : liste.filter(e => (e.categorie_libre || e.categorie) === cat)
  const [phare, ...suite] = filtres

  if (!liste.length) return <Vide texte="Aucun événement programmé pour l’instant." />

  return (
    <>
      {/* Chips seulement s'il y a de quoi filtrer — un seul choix n'est pas un filtre. */}
      {cats.length > 2 && (
        <div className="flex gap-2 overflow-x-auto" style={{ padding: '14px 18px 0', scrollbarWidth: 'none' }}>
          {cats.map(c => {
            const actif = c === cat
            return (
              <button key={c} onClick={() => setCat(c)} className="flex-none whitespace-nowrap"
                style={{
                  borderRadius: 999, padding: '7px 13px', fontSize: 12,
                  fontWeight: actif ? 700 : 600,
                  border: `1px solid ${actif ? 'var(--cine-accent)' : 'rgba(250,251,250,.12)'}`,
                  background: actif ? 'rgba(157,207,238,.14)' : 'transparent',
                  color: actif ? 'var(--cine-accent2)' : 'var(--cine-dim)',
                }}>
                {c === 'tout' ? 'Tout' : c}
              </button>
            )
          })}
        </div>
      )}

      {phare && (
        <Link href={`/evenement/${phare.id}`} className="block no-underline"
          style={{ margin: '14px 18px 0', borderRadius: 16, padding: 18, background: 'linear-gradient(140deg,rgba(157,207,238,.16),rgba(157,207,238,.03))', border: '1px solid var(--cine-line)' }}>
          <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--cine-accent)' }}>
            À ne pas manquer
          </span>
          <h3 className="m-0 font-title" style={{ marginTop: 10, fontSize: 20, fontWeight: 700, lineHeight: 1.2, color: 'var(--cine-ink)' }}>{phare.titre}</h3>
          <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--cine-dim)', lineHeight: 1.5 }}>
            {jourLong(phare.date_debut)}{phare.heure ? ` · ${formatHeure(phare.heure)}` : ''}
          </div>
          <span className="inline-flex items-center"
            style={{ marginTop: 14, gap: 7, borderRadius: 9, background: 'var(--cine-accent)', color: '#0E1620', padding: '10px 14px', fontSize: 12.5, fontWeight: 800 }}>
            Voir l’événement
          </span>
        </Link>
      )}

      <div className="flex flex-col gap-2.5" style={{ margin: '12px 18px 0' }}>
        {suite.map(e => {
          const { nom, num } = jourCourt(e.date_debut)
          return (
            <Link key={e.id} href={`/evenement/${e.id}`} className="flex overflow-hidden no-underline"
              style={{ borderRadius: 13, background: 'var(--cine-panel)', border: '1px solid rgba(250,251,250,.07)' }}>
              <div className="flex flex-none flex-col items-center justify-center gap-0.5"
                style={{ width: 58, background: 'rgba(157,207,238,.07)', borderRight: '1px solid var(--cine-line)' }}>
                <b className="font-title" style={{ fontSize: 20, lineHeight: 1, fontWeight: 700, color: 'var(--cine-accent2)' }}>{num}</b>
                <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(157,207,238,.6)' }}>{nom}</span>
              </div>
              <div className="min-w-0 flex-1" style={{ padding: 12 }}>
                {(e.categorie_libre || e.categorie) && (
                  <span style={{ display: 'inline-block', borderRadius: 4, padding: '2px 7px', fontSize: 9, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', background: 'rgba(157,207,238,.16)', color: 'var(--cine-accent2)' }}>
                    {e.categorie_libre || e.categorie}
                  </span>
                )}
                <div className="truncate" style={{ marginTop: 6, fontSize: 13.5, fontWeight: 600, letterSpacing: '-.01em', color: 'var(--cine-ink)' }}>{e.titre}</div>
                <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--cine-dim2)' }}>
                  {jourLong(e.date_debut)}{e.heure ? ` · ${formatHeure(e.heure)}` : ''}
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </>
  )
}
