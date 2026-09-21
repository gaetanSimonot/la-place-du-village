'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
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
 * autre couleur, bottom nav comprise. Le thème est posé sur <html> au montage
 * et retiré au démontage — il ne peut donc pas fuir sur le reste de l'app,
 * même en sortant par le bouton retour du système.
 *
 * Le rouge profond du théâtre plutôt que le bleu nuit du cinéma : ce sont
 * deux maisons, le module doit se reconnaître d'un coup d'œil.
 *
 * MÊME MÉCANIQUE QUE LE CINÉMA, et c'est délibéré : les visuels défilent en
 * haut, les dates se lisent en dessous, et un visuel mène à SA FICHE. Le
 * premier jet déroulait tout sur une seule page interminable — on y perdait
 * ce qui fait le prix d'un programme : pouvoir tenir un spectacle en main.
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
  /** Le spectacle dont on regarde les dates. `null` = les dates de tous. */
  const [choisi, setChoisi] = useState<string | null>(null)

  // `?theatre=` lu sur window et non via useSearchParams : ce dernier fait
  // basculer la page en rendu client et casse le prérendu statique.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const t = new URLSearchParams(window.location.search).get('theatre')
    if (t) setSalleDemandee(t)
  }, [])

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
  const nomsSalles = useMemo(
    () => Object.fromEntries(salles.map(t => [t.id, t.nom])),
    [salles])

  /** Le rouleau du haut : un spectacle, sa prochaine date. */
  const enTete = useMemo(() => {
    const source = onglet === 'passes' ? (data?.passees ?? []) : (data?.representations ?? [])
    const dates = onglet === 'passes' ? source : representationsPubliques(source)
    const vus: Record<string, true> = {}
    const out: { s: Spectacle; date: Representation }[] = []
    for (const r of dates) {
      if (vus[r.spectacle_id]) continue
      const s = parId[r.spectacle_id]
      if (!s) continue
      vus[r.spectacle_id] = true
      out.push({ s, date: r })
    }
    if (onglet !== 'affiche') return out
    // À l'affiche : ce qui se joue dans les six semaines.
    const limite = new Date(Date.now() + 42 * 86_400_000).toISOString().slice(0, 10)
    return out.filter(x => x.date.date <= limite)
  }, [data, parId, onglet])

  /** Les dates listées dessous : celles du spectacle choisi, sinon toutes. */
  const datesListees = useMemo(() => {
    const source = onglet === 'passes' ? (data?.passees ?? []) : (data?.representations ?? [])
    const base = onglet === 'passes' ? source : representationsPubliques(source)
    const retenues = choisi ? base.filter(r => r.spectacle_id === choisi) : base
    if (onglet === 'affiche' && !choisi) {
      const limite = new Date(Date.now() + 42 * 86_400_000).toISOString().slice(0, 10)
      return retenues.filter(r => r.date <= limite)
    }
    return retenues
  }, [data, choisi, onglet])

  // Changer d'onglet remet la sélection à zéro : un spectacle retenu dans
  // « À l'affiche » n'a rien à faire dans « Déjà joués ».
  useEffect(() => { setChoisi(null) }, [onglet])

  const spectacleChoisi = choisi ? parId[choisi] : null

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
          <p className="m-0 mt-1 text-[12px]" style={{ color: 'var(--th-doux2)' }}>{salleUnique.commune}</p>
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
              <button key={o.id} onClick={() => setSalleDemandee(o.cle)} className="flex-none"
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

      {isLoading && !data && (
        <p className="text-center py-10 text-[13px]" style={{ color: 'var(--th-doux2)' }}>Un instant…</p>
      )}

      {/* Une page de module dit d'elle-même quand elle est vide, plutôt que de
          disparaître du menu. */}
      {!isLoading && enTete.length === 0 && (
        <p className="text-center py-10 px-6 text-[13px] leading-relaxed" style={{ color: 'var(--th-doux2)' }}>
          {salles.length === 0
            ? 'Aucun théâtre n’a encore rejoint La Place par ici.'
            : onglet === 'passes'
              ? 'Rien n’a encore été joué cette saison.'
              : 'Pas de date annoncée pour l’instant.'}
        </p>
      )}

      {enTete.length > 0 && (
        <>
          {/* LE ROULEAU. Un appui retient le spectacle et n'affiche que ses
              dates ; un second appui sur le même le relâche. Le lien « Voir la
              fiche » mène à la page complète — deux gestes distincts pour deux
              intentions distinctes, comme au cinéma. */}
          <div className="flex gap-3 overflow-x-auto px-[18px] pb-1.5" style={{ scrollbarWidth: 'none' }}>
            {enTete.map(({ s, date }) => {
              const actif = choisi === s.id
              return (
                <button key={s.id} onClick={() => setChoisi(actif ? null : s.id)}
                  className="w-[118px] flex-none border-none bg-transparent p-0 text-left">
                  <span className="relative block w-full overflow-hidden rounded-[12px]"
                    style={{
                      aspectRatio: '3 / 4',
                      background: 'linear-gradient(160deg,#2A1B1F,#0F0A0C)',
                      outline: actif ? '2px solid var(--th-accent)' : 'none',
                      outlineOffset: 2,
                    }}>
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
                    <span className="absolute inset-x-0 bottom-0 px-2 py-1.5"
                      style={{ background: 'linear-gradient(to top, rgba(15,10,12,.92), transparent)' }}>
                      <span className="block text-[10.5px] font-extrabold" style={{ color: 'var(--th-accent2)' }}>
                        {dateLisible(date.date).replace(/^\w+ /, '')}
                        {heureLisible(date.heure) ? ` · ${heureLisible(date.heure)}` : ''}
                      </span>
                    </span>
                  </span>
                  <span className="mt-2 block line-clamp-2"
                    style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3, letterSpacing: '-.01em', color: 'var(--th-encre)' }}>
                    {s.titre}
                  </span>
                  {s.compagnie && (
                    <span className="mt-0.5 block truncate" style={{ fontSize: 11.5, color: 'var(--th-doux2)' }}>
                      {s.compagnie}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Le spectacle retenu : sa carte d'identité et la porte vers sa
              fiche. Sans cette porte, on croirait que les dates sont tout ce
              qu'il y a à savoir. */}
          {spectacleChoisi && (
            <div className="mx-4 mt-4 overflow-hidden rounded-[14px]" style={{ background: 'var(--th-carte)' }}>
              <div className="p-4">
                {spectacleChoisi.genre && (
                  <p className="m-0 text-[10px] font-extrabold uppercase"
                    style={{ letterSpacing: '0.12em', color: 'var(--th-accent2)' }}>
                    {spectacleChoisi.genre}
                  </p>
                )}
                <h2 className="m-0 mt-1 font-title"
                  style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-.015em', color: 'var(--th-encre)' }}>
                  {spectacleChoisi.titre}
                </h2>
                {(spectacleChoisi.duree_min || spectacleChoisi.public_conseille) && (
                  <p className="m-0 mt-1 text-[11.5px]" style={{ color: 'var(--th-doux2)' }}>
                    {[dureeLisible(spectacleChoisi.duree_min), spectacleChoisi.public_conseille]
                      .filter(Boolean).join(' · ')}
                  </p>
                )}
                <Link href={`/theatre/spectacle/${spectacleChoisi.id}`}
                  className="mt-3 inline-flex items-center gap-1.5 no-underline"
                  style={{
                    border: '1px solid var(--th-accent)', borderRadius: 999,
                    padding: '8px 15px', fontSize: 12.5, fontWeight: 700, color: 'var(--th-accent2)',
                  }}>
                  Voir la fiche
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="13 6 19 12 13 18" />
                  </svg>
                </Link>
              </div>
            </div>
          )}

          <h2 className="m-0 px-4 pt-6 pb-2 font-title"
            style={{ fontSize: 15, fontWeight: 700, color: 'var(--th-encre)' }}>
            {spectacleChoisi ? 'Ses dates' : onglet === 'passes' ? 'Déjà joué' : 'Les prochaines dates'}
            <span className="ml-2 text-[12px]" style={{ fontWeight: 600, color: 'var(--th-doux2)' }}>
              {datesListees.length}
            </span>
          </h2>

          <div className="px-4 space-y-1.5">
            {datesListees.map(r => {
              const s = parId[r.spectacle_id]
              if (!s) return null
              return (
                <Link key={r.id} href={`/theatre/spectacle/${s.id}`}
                  className="flex items-baseline gap-2 no-underline"
                  style={{ padding: '7px 0', borderBottom: '1px solid rgba(251,246,242,.07)' }}>
                  <span className="shrink-0 text-[12.5px]" style={{ fontWeight: 700, color: 'var(--th-encre)', minWidth: 118 }}>
                    {dateLisible(r.date)}
                  </span>
                  {heureLisible(r.heure) && (
                    <span className="shrink-0 text-[12.5px]" style={{ color: 'var(--th-accent2)' }}>
                      {heureLisible(r.heure)}
                    </span>
                  )}
                  {!spectacleChoisi && (
                    <span className="min-w-0 flex-1 truncate text-[12.5px]" style={{ color: 'var(--th-doux)' }}>
                      {s.titre}
                    </span>
                  )}
                  <span className="shrink-0 truncate text-[11px]" style={{ color: 'var(--th-doux2)', maxWidth: '38%' }}>
                    {r.lieu || nomsSalles[r.etablissement_id] || ''}
                  </span>
                </Link>
              )
            })}
          </div>
        </>
      )}

      <BottomNavBar />
    </div>
  )
}
