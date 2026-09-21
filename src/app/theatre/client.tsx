'use client'
import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import BottomNavBar from '@/components/BottomNavBar'
import { useTerritoire } from '@/components/TerritoireProvider'
import {
  dureeLisible, heureLisible, representationsPubliques,
  type Theatre, type Spectacle, type Representation,
} from '@/lib/theatre'

/**
 * UNIVERS THÉÂTRE — public, sans compte.
 *
 * Même parti que le cinéma : entrer ici fait basculer toute l'app dans une
 * autre couleur, bottom nav comprise, pour qu'on sente qu'on est ailleurs le
 * temps d'un instant. Le thème est posé sur <html> au montage et retiré au
 * démontage — il ne peut donc pas fuir sur le reste de l'app, même en
 * sortant par le bouton retour du système.
 *
 * Le rouge profond du théâtre plutôt que le bleu nuit du cinéma : ce sont
 * deux maisons différentes, et le module doit se reconnaître d'un coup d'œil.
 *
 * On ne touche pas à la structure : la bottom nav reste celle de l'app,
 * mêmes onglets, mêmes libellés. Seul son habillage change.
 */

interface Payload {
  theatres: Theatre[]
  theatre: Theatre | null
  spectacles: Spectacle[]
  representations: Representation[]
  passees: Representation[]
  aujourdhui: string
}

type Onglet = 'affiche' | 'saison' | 'passes'
const ONGLETS: { id: Onglet; label: string }[] = [
  { id: 'affiche', label: 'À l’affiche' },
  { id: 'saison',  label: 'La saison' },
  { id: 'passes',  label: 'Déjà joués' },
]

const fetcher = (u: string) => fetch(u).then(r => r.json())

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

/** « 2026-12-15 » → « mardi 15 décembre ». Midi UTC : le fuseau ne décale rien. */
function dateLisible(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`)
  return `${JOURS[d.getUTCDay()]} ${d.getUTCDate()} ${MOIS[d.getUTCMonth()]}`
}

export default function TheatreClient() {
  const { territoire } = useTerritoire()
  const qTerr = territoire?.slug ? `&territoire=${encodeURIComponent(territoire.slug)}` : ''

  const [salleDemandee, setSalleDemandee] = useState<string | null>(null)
  const [onglet, setOnglet] = useState<Onglet>('affiche')
  const [ouvert, setOuvert] = useState<string | null>(null)

  // `?theatre=` lu sur window et non via useSearchParams : ce dernier fait
  // basculer la page en rendu client et casse le prérendu statique.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const t = new URLSearchParams(window.location.search).get('theatre')
    if (t) setSalleDemandee(t)
  }, [])

  /*
   * L'univers est posé sur <html>, et retiré au démontage.
   *
   * Sur l'élément racine parce que la bottom nav et les modales vivent en
   * dehors de cet arbre : une classe posée ici ne les atteindrait pas.
   */
  useEffect(() => {
    document.documentElement.classList.add('pcv-theatre')
    return () => { document.documentElement.classList.remove('pcv-theatre') }
  }, [])

  const url = `/api/theatre?x=1${qTerr}${salleDemandee ? `&theatre=${encodeURIComponent(salleDemandee)}` : ''}`
  const { data, isLoading } = useSWR<Payload>(url, fetcher, { keepPreviousData: true })

  const salles = data?.theatres ?? []
  const salleUnique = data?.theatre ?? (salles.length === 1 ? salles[0] : null)
  const parId = useMemo(
    () => Object.fromEntries((data?.spectacles ?? []).map(s => [s.id, s])),
    [data?.spectacles])

  /** Un spectacle et toutes ses dates, le plus proche d'abord. */
  const parSpectacle = useMemo(() => {
    const out: { spectacle: Spectacle; dates: Representation[] }[] = []
    const vu: Record<string, number> = {}
    for (const r of data?.representations ?? []) {
      const s = parId[r.spectacle_id]
      if (!s) continue
      if (vu[r.spectacle_id] === undefined) {
        vu[r.spectacle_id] = out.length
        out.push({ spectacle: s, dates: [] })
      }
      out[vu[r.spectacle_id]].dates.push(r)
    }
    return out
  }, [data?.representations, parId])

  const passes = useMemo(() => {
    const out: { spectacle: Spectacle; dates: Representation[] }[] = []
    const vu: Record<string, number> = {}
    for (const r of data?.passees ?? []) {
      const s = parId[r.spectacle_id]
      if (!s) continue
      if (vu[r.spectacle_id] === undefined) {
        vu[r.spectacle_id] = out.length
        out.push({ spectacle: s, dates: [] })
      }
      out[vu[r.spectacle_id]].dates.push(r)
    }
    return out
  }, [data?.passees, parId])

  /** À l'affiche : ce qui se joue dans les six semaines. */
  const alAffiche = useMemo(() => {
    const limite = new Date(Date.now() + 42 * 86_400_000).toISOString().slice(0, 10)
    return parSpectacle.filter(x => x.dates.some(d => d.date <= limite))
  }, [parSpectacle])

  const liste = onglet === 'affiche' ? alAffiche : onglet === 'saison' ? parSpectacle : passes

  return (
    <div className="min-h-[100dvh] pb-28" style={{ background: 'var(--th-fond)' }}>
      <style>{`
        html.pcv-theatre {
          --th-fond: #17090C;
          --th-carte: #230F14;
          --th-encre: #FBF6F2;
          --th-doux: #C9A9AE;
          --th-doux2: #8E7176;
          --th-accent: #C0455C;
          --th-accent2: #E88A9B;
          --pcv-nav-bg: #230F14;
          --pcv-nav-fg: #C9A9AE;
          --pcv-nav-actif: #E88A9B;
        }
      `}</style>

      <header className="px-4 pt-6 pb-4">
        <p className="m-0 text-[10px] font-extrabold uppercase"
          style={{ letterSpacing: '0.16em', color: 'var(--th-accent2)' }}>
          Spectacle vivant
        </p>
        <h1 className="m-0 mt-1 font-title"
          style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--th-encre)' }}>
          {salleUnique ? salleUnique.nom : 'Au théâtre'}
        </h1>
        {salleUnique?.commune && (
          <p className="m-0 mt-1 text-[12px]" style={{ color: 'var(--th-doux2)' }}>
            {salleUnique.commune}
          </p>
        )}
        {!salleUnique && salles.length > 1 && (
          <p className="m-0 mt-2 text-[12px]" style={{ color: 'var(--th-doux2)' }}>
            {salles.length} salles autour de vous
          </p>
        )}
      </header>

      {/* Choisir sa salle — n'apparaît qu'à partir de la deuxième, et les
          pastilles passent à la ligne plutôt que de sortir de l'écran. */}
      {salles.length > 1 && (
        <div className="flex flex-wrap justify-center px-4 pb-3" style={{ gap: 8 }}>
          {[{ id: 'tous', nom: 'Tous', cle: null as string | null },
            ...salles.map(t => ({ id: t.id, nom: t.nom, cle: t.slug ?? t.id }))].map(o => {
            const actif = o.cle === null ? !salleUnique : salleUnique?.id === o.id
            return (
              <button key={o.id} onClick={() => setSalleDemandee(o.cle)}
                className="flex-none"
                style={{
                  maxWidth: 'min(15rem, 46vw)', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  borderRadius: 999, padding: '7px 13px', fontSize: 12,
                  fontWeight: actif ? 700 : 600,
                  border: `1px solid ${actif ? 'var(--th-accent)' : 'rgba(251,246,242,.14)'}`,
                  background: actif ? 'rgba(192,69,92,.18)' : 'transparent',
                  color: actif ? 'var(--th-accent2)' : 'var(--th-doux)',
                }}>
                {o.nom}
              </button>
            )
          })}
        </div>
      )}

      <div className="flex justify-center px-4 pb-4" style={{ gap: 8 }}>
        {ONGLETS.map(o => {
          const actif = onglet === o.id
          return (
            <button key={o.id} onClick={() => setOnglet(o.id)}
              style={{
                borderRadius: 999, padding: '7px 14px', fontSize: 12.5,
                fontWeight: actif ? 700 : 600,
                border: `1px solid ${actif ? 'var(--th-accent)' : 'rgba(251,246,242,.12)'}`,
                background: actif ? 'rgba(192,69,92,.18)' : 'transparent',
                color: actif ? 'var(--th-accent2)' : 'var(--th-doux)',
              }}>
              {o.label}
            </button>
          )
        })}
      </div>

      <div className="px-4 space-y-3">
        {isLoading && !data && (
          <p className="text-center py-10 text-[13px]" style={{ color: 'var(--th-doux2)' }}>
            Un instant…
          </p>
        )}

        {/* Une page de module dit d'elle-même quand elle est vide, plutôt que
            de disparaître du menu. */}
        {!isLoading && !liste.length && (
          <p className="text-center py-10 text-[13px] leading-relaxed" style={{ color: 'var(--th-doux2)' }}>
            {salles.length === 0
              ? 'Aucun théâtre n’a encore rejoint La Place par ici.'
              : onglet === 'passes'
                ? 'Rien n’a encore été joué cette saison.'
                : 'Pas de date annoncée pour l’instant.'}
          </p>
        )}

        {liste.map(({ spectacle: s, dates }) => {
          const publiques = representationsPubliques(dates)
          const scolaires = dates.filter(d => d.scolaire)
          const estOuvert = ouvert === s.id
          return (
            <article key={s.id} className="overflow-hidden"
              style={{ background: 'var(--th-carte)', borderRadius: 16 }}>
              {s.affiche_url && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={s.affiche_url} alt=""
                  className="w-full" style={{ aspectRatio: '3 / 4', objectFit: 'cover' }} />
              )}
              <div className="p-4">
                {s.genre && (
                  <p className="m-0 text-[10px] font-extrabold uppercase"
                    style={{ letterSpacing: '0.12em', color: 'var(--th-accent2)' }}>
                    {s.genre}
                  </p>
                )}
                <h2 className="m-0 mt-1 font-title"
                  style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.015em', color: 'var(--th-encre)' }}>
                  {s.titre}
                </h2>
                {s.compagnie && (
                  <p className="m-0 mt-0.5 text-[12.5px]" style={{ color: 'var(--th-doux)' }}>
                    {s.compagnie}
                  </p>
                )}

                <p className="m-0 mt-1 text-[11.5px]" style={{ color: 'var(--th-doux2)' }}>
                  {[dureeLisible(s.duree_min), s.public_conseille].filter(Boolean).join(' · ')}
                </p>

                <div className="mt-3 space-y-1">
                  {publiques.map(d => (
                    <div key={d.id} className="flex items-baseline gap-2 text-[13px]"
                      style={{ color: 'var(--th-encre)' }}>
                      <span style={{ fontWeight: 700 }}>{dateLisible(d.date)}</span>
                      {heureLisible(d.heure) && (
                        <span style={{ color: 'var(--th-accent2)' }}>{heureLisible(d.heure)}</span>
                      )}
                      {d.lieu && (
                        <span className="text-[11.5px]" style={{ color: 'var(--th-doux2)' }}>{d.lieu}</span>
                      )}
                    </div>
                  ))}
                  {/* Une séance scolaire se dit, mais ne s'offre pas : on ne
                      peut pas y venir. */}
                  {scolaires.length > 0 && (
                    <p className="m-0 pt-1 text-[11px]" style={{ color: 'var(--th-doux2)' }}>
                      {scolaires.length} représentation{scolaires.length > 1 ? 's' : ''} scolaire
                      {scolaires.length > 1 ? 's' : ''} — non ouverte
                      {scolaires.length > 1 ? 's' : ''} au public
                    </p>
                  )}
                </div>

                {s.synopsis && (
                  <>
                    <p className="m-0 mt-3 text-[13px] leading-relaxed"
                      style={{
                        color: 'var(--th-doux)',
                        display: estOuvert ? 'block' : '-webkit-box',
                        WebkitLineClamp: estOuvert ? 'none' : 4,
                        WebkitBoxOrient: 'vertical',
                        overflow: estOuvert ? 'visible' : 'hidden',
                      }}>
                      {s.synopsis}
                    </p>
                    {s.synopsis.length > 240 && (
                      <button onClick={() => setOuvert(estOuvert ? null : s.id)}
                        className="mt-1 text-[12px] font-bold"
                        style={{ color: 'var(--th-accent2)' }}>
                        {estOuvert ? 'Réduire' : 'Lire la suite'}
                      </button>
                    )}
                  </>
                )}

                {estOuvert && s.distribution && (
                  <p className="m-0 mt-3 text-[11.5px] leading-relaxed" style={{ color: 'var(--th-doux2)' }}>
                    {s.distribution}
                  </p>
                )}
              </div>
            </article>
          )
        })}
      </div>

      {salleUnique?.billetterie_url && (
        <div className="px-4 pt-4">
          <a href={salleUnique.billetterie_url} target="_blank" rel="noopener noreferrer"
            className="block text-center no-underline"
            style={{
              background: 'var(--th-accent)', color: '#fff', borderRadius: 999,
              padding: '12px 18px', fontSize: 13.5, fontWeight: 700,
            }}>
            Réserver
          </a>
        </div>
      )}

      <BottomNavBar />
    </div>
  )
}
