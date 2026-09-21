'use client'
import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import BottomNavBar from '@/components/BottomNavBar'
import {
  dureeLisible, heureLisible,
  type Theatre, type Spectacle, type Representation,
} from '@/lib/theatre'

/**
 * Fiche spectacle — publique, sans compte.
 *
 * Elle porte tout ce que le programme dit : le visuel, le genre, la durée, le
 * public, la présentation, la distribution, et toutes les dates.
 *
 * Les dates sont séparées en DEUX listes, et c'est la différence avec le
 * cinéma : les prochaines d'abord, puis celles qui sont passées. Un spectacle
 * déjà joué garde sa fiche — on veut pouvoir lire ce qui a été programmé —
 * mais on ne doit jamais confondre une date révolue avec une date à venir.
 */

interface Payload {
  spectacle: Spectacle
  representations: Representation[]
  theatres: Theatre[]
  aujourdhui: string
}

const fetcher = (u: string) => fetch(u).then(r => r.json())

function jourLisible(date: string): string {
  const s = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date(`${date}T12:00:00Z`))
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default function SpectacleClient({ id }: { id: string }) {
  const router = useRouter()

  // On reste dans la salle : la fiche porte le même univers que /theatre,
  // posé au montage et retiré au démontage pour qu'il ne fuie pas ailleurs.
  useEffect(() => {
    document.documentElement.classList.add('pcv-theatre')
    return () => { document.documentElement.classList.remove('pcv-theatre') }
  }, [])

  const { data, isLoading } = useSWR<Payload>(`/api/theatre/spectacle/${id}`, fetcher)
  const s = data?.spectacle
  const salles = useMemo(
    () => Object.fromEntries((data?.theatres ?? []).map(t => [t.id, t])),
    [data?.theatres])

  const auj = data?.aujourdhui ?? ''
  const aVenir = (data?.representations ?? []).filter(r => r.date >= auj)
  const passees = (data?.representations ?? []).filter(r => r.date < auj).reverse()

  const salle = aVenir[0] ? salles[aVenir[0].etablissement_id] : undefined
  const billetterie = aVenir[0]?.billetterie_url ?? salle?.billetterie_url ?? null

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

      <button onClick={() => router.back()}
        className="flex items-center gap-1.5 border-none bg-transparent px-4 pt-5 pb-1"
        style={{ color: 'var(--th-doux)', fontSize: 13, fontWeight: 600 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Retour
      </button>

      {isLoading && !s && (
        <p className="text-center py-16 text-[13px]" style={{ color: 'var(--th-doux2)' }}>Un instant…</p>
      )}
      {!isLoading && !s && (
        <p className="text-center py-16 text-[13px]" style={{ color: 'var(--th-doux2)' }}>
          Ce spectacle n’est plus au programme.
        </p>
      )}

      {s && (
        <>
          {s.affiche_url && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={s.affiche_url} alt={s.titre} className="w-full"
              style={{ aspectRatio: '3 / 4', objectFit: 'cover' }} />
          )}

          <div className="px-4 pt-4">
            {s.genre && (
              <p className="m-0 text-[10px] font-extrabold uppercase"
                style={{ letterSpacing: '0.14em', color: 'var(--th-accent2)' }}>{s.genre}</p>
            )}
            <h1 className="m-0 mt-1 font-title"
              style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--th-encre)' }}>
              {s.titre}
            </h1>
            {s.compagnie && (
              <p className="m-0 mt-1 text-[14px]" style={{ color: 'var(--th-doux)' }}>{s.compagnie}</p>
            )}
            {(s.duree_min || s.public_conseille) && (
              <p className="m-0 mt-1.5 text-[12px]" style={{ color: 'var(--th-doux2)' }}>
                {[dureeLisible(s.duree_min), s.public_conseille].filter(Boolean).join(' · ')}
              </p>
            )}

            {s.citation && (
              <p className="mt-4 mb-0 text-[13px] italic leading-relaxed"
                style={{
                  color: 'var(--th-encre)', background: 'rgba(192,69,92,.16)',
                  borderRadius: 12, padding: '12px 14px',
                }}>
                {s.citation}
              </p>
            )}

            {s.synopsis && (
              <p className="m-0 mt-4 text-[14px] leading-relaxed" style={{ color: 'var(--th-doux)' }}>
                {s.synopsis}
              </p>
            )}
          </div>

          <Dates titre="Prochaines dates" liste={aVenir} salles={salles} vide="Plus de date annoncée." />
          {passees.length > 0 && (
            <Dates titre="Déjà joué" liste={passees} salles={salles} passe />
          )}

          {s.distribution && (
            <div className="px-4 pt-6">
              <h2 className="m-0 text-[10px] font-extrabold uppercase"
                style={{ letterSpacing: '0.14em', color: 'var(--th-accent2)' }}>Distribution</h2>
              <p className="m-0 mt-2 text-[12.5px] leading-relaxed" style={{ color: 'var(--th-doux2)' }}>
                {s.distribution}
              </p>
            </div>
          )}

          {billetterie && aVenir.length > 0 && (
            <div className="px-4 pt-6">
              <a href={billetterie} target="_blank" rel="noopener noreferrer"
                className="block text-center no-underline"
                style={{
                  background: 'var(--th-accent)', color: '#fff', borderRadius: 999,
                  padding: '13px 18px', fontSize: 14, fontWeight: 700,
                }}>
                Réserver
              </a>
            </div>
          )}
        </>
      )}

      <BottomNavBar />
    </div>
  )
}

/**
 * Une liste de dates, groupée par jour.
 *
 * Une séance scolaire se dit, mais ne s'offre pas : elle figure au programme
 * — le théâtre en est fier, les parents la cherchent — et porte sa mention,
 * pour que personne ne se déplace pour rien.
 */
function Dates({ titre, liste, salles, vide, passe = false }: {
  titre: string
  liste: Representation[]
  salles: Record<string, Theatre>
  vide?: string
  passe?: boolean
}) {
  return (
    <div className="px-4 pt-6">
      <h2 className="m-0 text-[10px] font-extrabold uppercase"
        style={{ letterSpacing: '0.14em', color: passe ? 'var(--th-doux2)' : 'var(--th-accent2)' }}>
        {titre}
      </h2>
      {liste.length === 0 && vide && (
        <p className="m-0 mt-2 text-[13px]" style={{ color: 'var(--th-doux2)' }}>{vide}</p>
      )}
      <div className="mt-2 space-y-1.5">
        {liste.map(r => {
          const ou = r.lieu || salles[r.etablissement_id]?.nom || null
          return (
            <div key={r.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
              style={{ opacity: passe ? 0.55 : 1 }}>
              <span className="text-[13.5px]" style={{ fontWeight: 700, color: 'var(--th-encre)' }}>
                {jourLisible(r.date)}
              </span>
              {heureLisible(r.heure) && (
                <span className="text-[13.5px]" style={{ color: 'var(--th-accent2)' }}>
                  {heureLisible(r.heure)}
                </span>
              )}
              {ou && (
                <span className="text-[12px]" style={{ color: 'var(--th-doux2)' }}>{ou}</span>
              )}
              {r.scolaire && (
                <span className="text-[10px] font-bold uppercase"
                  style={{
                    letterSpacing: '0.08em', color: 'var(--th-doux2)',
                    border: '1px solid rgba(251,246,242,.16)', borderRadius: 999, padding: '1px 7px',
                  }}>
                  scolaire
                </span>
              )}
              {r.note && (
                <span className="text-[11.5px]" style={{ color: 'var(--th-doux2)' }}>{r.note}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
