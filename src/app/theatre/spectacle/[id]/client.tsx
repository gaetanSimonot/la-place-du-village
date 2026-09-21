'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { toast } from 'sonner'
import BottomNavBar from '@/components/BottomNavBar'
import BandeAnnonce from '@/components/cinema/BandeAnnonce'
import {
  dureeLisible, heureLisible,
  type Theatre, type Spectacle, type Representation,
} from '@/lib/theatre'

/**
 * Fiche spectacle — publique, sans compte.
 *
 * Jumelle de la fiche film : même en-tête retour/partage, même visuel à
 * gauche et informations à droite, même encadré de dates groupées par jour,
 * même carte de salle en bas. Seules les couleurs changent.
 *
 * Ce que le théâtre ajoute : les dates PASSÉES restent consultables, dans un
 * second encadré. Une séance d'hier n'intéresse personne ; un spectacle déjà
 * joué, si — on veut pouvoir regarder ce qui a été programmé. Mais on ne doit
 * jamais confondre une date révolue avec une date à venir, d'où deux blocs et
 * non une liste continue.
 */

interface LieuDeJeu {
  id: string
  nom: string
  adresse: string | null
  commune: string | null
  lat: number | null
  lng: number | null
}

interface Payload {
  spectacle: Spectacle
  representations: Representation[]
  theatres: Theatre[]
  /** Les endroits hors les murs, géocodés, rapprochés par NOM. */
  lieux: LieuDeJeu[]
  aujourdhui: string
}

const fetcher = (u: string) => fetch(u).then(r => r.json())
/** Jours affichés avant de proposer « voir toutes les dates ». */
const JOURS_REPLIES = 8

/**
 * L'adresse à montrer pour un endroit, ou rien du tout.
 *
 * La commune n'est répétée que si l'adresse ne la porte pas déjà :
 * « 440 Esplanade Charles de Gaulle, 34000 Montpellier, Montpellier » serait
 * du bruit. Et quand on n'a pas d'adresse, on n'en invente pas.
 */
function adresseDuLieu(etab: Theatre | null, lieu: LieuDeJeu | null): string | null {
  const source = etab ?? lieu
  if (!source) return null
  const adresse = source.adresse?.trim() || null
  const commune = source.commune?.trim() || null
  if (!adresse) return commune
  if (commune && !adresse.toLowerCase().includes(commune.toLowerCase())) {
    return `${adresse}, ${commune}`
  }
  return adresse
}

function jourLisible(date: string): string {
  const s = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date(`${date}T12:00:00Z`))
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default function SpectacleClient({ id }: { id: string }) {
  const router = useRouter()
  const [tout, setTout] = useState(false)
  const [videoOuverte, setVideoOuverte] = useState(false)

  // On reste dans la salle : la fiche porte le même thème que /theatre, posé
  // au montage et retiré au démontage pour qu'il ne fuie pas ailleurs.
  useEffect(() => {
    document.documentElement.dataset.univers = 'theatre'
    return () => { delete document.documentElement.dataset.univers }
  }, [])

  const { data, isLoading } = useSWR<Payload>(`/api/theatre/spectacle/${id}`, fetcher)

  const spectacle = data?.spectacle
  const salles = useMemo(() => new Map((data?.theatres ?? []).map(t => [t.id, t])), [data])
  const auj = data?.aujourdhui ?? ''
  const toutes = useMemo(() => data?.representations ?? [], [data])

  const aVenir = useMemo(() => toutes.filter(r => r.date >= auj), [toutes, auj])
  const passees = useMemo(() => toutes.filter(r => r.date < auj).reverse(), [toutes, auj])

  /** Groupement par jour : c'est ainsi qu'on choisit une date. */
  const parJour = useMemo(() => {
    const m = new Map<string, Representation[]>()
    for (const r of aVenir) { const l = m.get(r.date) ?? []; l.push(r); m.set(r.date, l) }
    return Array.from(m.entries())
  }, [aVenir])
  const joursAffiches = tout ? parJour : parJour.slice(0, JOURS_REPLIES)

  const parJourPasse = useMemo(() => {
    const m = new Map<string, Representation[]>()
    for (const r of passees) { const l = m.get(r.date) ?? []; l.push(r); m.set(r.date, l) }
    return Array.from(m.entries())
  }, [passees])

  const lieuxConnus = useMemo(
    () => new Map((data?.lieux ?? []).map(l => [l.nom, l])), [data?.lieux])

  /**
   * OÙ L'ON VA LE VOIR — construit sur les DATES du spectacle, jamais sur la
   * salle qui le programme.
   *
   * C'est la correction du 21/09 : l'Albarède programme toute la saison, mais
   * « Garder » se joue aux Belvédères de Blandas et « Pixel » à l'Opéra
   * Berlioz. La fiche affichait l'adresse du théâtre — elle envoyait les
   * gens à 40 km du spectacle.
   *
   * Trois cas, dans cet ordre de précision :
   *   1. le lieu porte une fiche établissement → sa carte, cliquable ;
   *   2. il est dans le registre des lieux → son nom et son adresse ;
   *   3. ce n'est pas un endroit (« Écoles du territoire », « Divers lieux »)
   *      → son libellé seul. On n'invente pas d'adresse.
   */
  const ouLeVoir = useMemo(() => {
    const vus = new Set<string>()
    const out: {
      cle: string; nom: string; adresse: string | null
      etablissement: Theatre | null; lieu: LieuDeJeu | null
    }[] = []
    for (const r of toutes) {
      const salle = salles.get(r.etablissement_id) ?? null
      // Sans libellé propre, la date se joue dans les murs de la salle.
      const nom = r.lieu ?? salle?.nom ?? null
      if (!nom || vus.has(nom)) continue
      vus.add(nom)

      // Le libellé désigne-t-il la salle elle-même ?
      const etab = salle && (!r.lieu || r.lieu === salle.nom) ? salle : null
      const lieu = lieuxConnus.get(nom) ?? null
      out.push({
        cle: nom, nom,
        adresse: adresseDuLieu(etab, lieu),
        etablissement: etab, lieu,
      })
    }
    return out
  }, [toutes, salles, lieuxConnus])

  async function partager() {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    try {
      if (navigator.share) await navigator.share({ title: spectacle?.titre, url })
      else { await navigator.clipboard.writeText(url); toast.success('Lien copié.') }
    } catch { /* partage annulé */ }
  }

  return (
    <div className="pcv-cine relative min-h-[100dvh] font-inter"
      style={{ background: 'var(--uni-bg)', color: 'var(--uni-ink)', paddingBottom: 92 }}>
      {/* En-tête : retour et partage, comme sur les fiches événements */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5"
        style={{ paddingTop: 'max(14px, env(safe-area-inset-top, 14px))' }}>
        <button onClick={() => router.back()} aria-label="Retour"
          className="flex h-[34px] w-[34px] items-center justify-center rounded-full"
          style={{ border: '1px solid var(--uni-line)', background: 'rgba(253,246,243,.05)', color: 'var(--uni-ink)' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <button onClick={partager} aria-label="Partager"
          className="flex h-[34px] w-[34px] items-center justify-center rounded-full"
          style={{ border: '1px solid var(--uni-line)', background: 'rgba(253,246,243,.05)', color: 'var(--uni-ink)' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="13 6 19 12 13 18" /><path d="M19 12H8a4 4 0 0 0-4 4v2" />
          </svg>
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-7 w-7 animate-spin rounded-full"
            style={{ border: '3px solid rgba(236,96,66,.2)', borderTopColor: 'var(--uni-accent)' }} />
        </div>
      ) : !spectacle ? (
        <div className="mx-4 mt-6 rounded-[14px] p-6 text-center" style={{ border: '1px solid var(--uni-line)' }}>
          <p className="m-0 text-[14px] font-extrabold" style={{ color: 'var(--uni-ink)' }}>Spectacle introuvable</p>
        </div>
      ) : (
        <>
          {/* Visuel + informations */}
          <div className="flex gap-4 px-4 pt-4">
            <div className="relative w-[122px] shrink-0 overflow-hidden rounded-[12px]"
              style={{ aspectRatio: '3 / 4', background: 'linear-gradient(160deg,#3E211C,#1A0E0D)', boxShadow: '0 6px 18px rgba(18,7,6,.34)' }}>
              {spectacle.affiche_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={spectacle.affiche_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-end p-2">
                  <span style={{ fontSize: 10.5, fontWeight: 800, lineHeight: 1.15, color: '#F4E7CE', textShadow: '0 1px 3px rgba(0,0,0,.6)' }}>{spectacle.titre}</span>
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              {spectacle.genre && (
                <div className="text-[9.5px] font-extrabold uppercase"
                  style={{ letterSpacing: '.14em', color: 'var(--uni-accent)' }}>{spectacle.genre}</div>
              )}
              <h1 className="m-0 font-title" style={{ marginTop: spectacle.genre ? 5 : 0, fontSize: 23, lineHeight: 1.15, letterSpacing: '-.02em', color: 'var(--uni-ink)' }}>
                {spectacle.titre}
              </h1>
              {spectacle.compagnie && (
                <div className="mt-1 text-[12.5px]" style={{ color: 'var(--uni-ink)' }}>
                  <span style={{ color: 'var(--uni-dim2)' }}>Par </span>{spectacle.compagnie}
                </div>
              )}
              <div style={{ marginTop: 9, fontSize: 12.5, color: 'var(--uni-dim)', lineHeight: 1.6 }}>
                {[dureeLisible(spectacle.duree_min), spectacle.public_conseille].filter(Boolean).join(' · ')}
              </div>
              {spectacle.bande_annonce_url && (
                <button onClick={() => setVideoOuverte(true)}
                  className="inline-flex items-center"
                  style={{ marginTop: 12, gap: 7, border: '1px solid rgba(236,96,66,.5)', background: 'transparent', borderRadius: 9, padding: '8px 12px', fontSize: 12.5, fontWeight: 700, color: 'var(--uni-accent2)' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20" /></svg>
                  Teaser
                </button>
              )}
            </div>
          </div>

          {/* La phrase que la compagnie a choisie pour son spectacle. Elle
              passe avant la présentation : c'est elle qui donne envie. */}
          {spectacle.citation && (
            <div className="px-4 pt-5">
              <p className="m-0 italic"
                style={{ background: 'rgba(236,96,66,.12)', borderLeft: '2px solid var(--uni-accent)', borderRadius: '0 10px 10px 0', padding: '12px 14px', fontSize: 13.5, lineHeight: 1.6, color: 'var(--uni-ink)' }}>
                {spectacle.citation}
              </p>
            </div>
          )}

          {spectacle.synopsis && (
            <div className="px-4 pt-5">
              <h2 className="m-0 mb-1.5 font-title text-[17px] leading-tight" style={{ color: 'var(--uni-ink)' }}>Le spectacle</h2>
              <p className="m-0 whitespace-pre-line" style={{ fontSize: 13.5, lineHeight: 1.62, color: 'var(--uni-dim)' }}>{spectacle.synopsis}</p>
            </div>
          )}

          {/* Dates à venir, groupées par jour */}
          <div className="px-4 pt-5">
            <h2 className="m-0 mb-2 font-title text-[17px] leading-tight" style={{ color: 'var(--uni-ink)' }}>Dates</h2>
            {parJour.length === 0 ? (
              <div className="rounded-[14px] p-5 text-center" style={{ border: '1px solid var(--uni-line)' }}>
                <p className="m-0 text-[13px]" style={{ color: 'var(--uni-dim)' }}>
                  {passees.length ? 'Ce spectacle a fini sa tournée par ici.' : 'Aucune date programmée pour l’instant.'}
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-[14px]" style={{ border: '1px solid var(--uni-line)' }}>
                {joursAffiches.map(([date, liste]) => (
                  <Jour key={date} date={date} liste={liste} salles={salles} />
                ))}
                {!tout && parJour.length > JOURS_REPLIES && (
                  <button onClick={() => setTout(true)}
                    className="block w-full border-none"
                    style={{ borderTop: '1px solid var(--uni-line)', background: 'rgba(236,96,66,.07)', padding: 13, fontSize: 12.5, fontWeight: 700, color: 'var(--uni-accent)' }}>
                    Voir toutes les dates ({parJour.length} jours)
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Ce qui a déjà été joué. À part, et estompé : on ne doit jamais
              confondre une date révolue avec une date à venir. */}
          {parJourPasse.length > 0 && (
            <div className="px-4 pt-5" style={{ opacity: 0.62 }}>
              <h2 className="m-0 mb-2 font-title text-[17px] leading-tight" style={{ color: 'var(--uni-ink)' }}>Déjà joué</h2>
              <div className="overflow-hidden rounded-[14px]" style={{ border: '1px solid var(--uni-line)' }}>
                {parJourPasse.map(([date, liste]) => (
                  <Jour key={date} date={date} liste={liste} salles={salles} passe />
                ))}
              </div>
            </div>
          )}

          {spectacle.distribution && (
            <div className="px-4 pt-5">
              <h2 className="m-0 mb-1.5 font-title text-[17px] leading-tight" style={{ color: 'var(--uni-ink)' }}>Distribution</h2>
              <p className="m-0 whitespace-pre-line" style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--uni-dim2)' }}>
                {spectacle.distribution}
              </p>
            </div>
          )}

          {/* OÙ LE VOIR. Un endroit par ligne, dans l'ordre des dates.

              Une salle qui a sa fiche reste cliquable — c'est là qu'on trouve
              le téléphone et les horaires. Un lieu hors les murs montre son
              adresse, géocodée une fois, et ouvre l'itinéraire. Ce qui n'est
              pas un endroit — « Écoles du territoire », « Divers lieux » —
              garde son libellé seul : on n'invente pas d'adresse. */}
          {ouLeVoir.length > 0 && (
            <div className="px-4 pt-5">
              <h2 className="m-0 mb-2 font-title text-[17px] leading-tight" style={{ color: 'var(--uni-ink)' }}>
                {ouLeVoir.length > 1 ? 'Où le voir' : 'La salle'}
              </h2>
              <div className="flex flex-col gap-2">
                {ouLeVoir.map(o => {
                  const dedans = (
                    <>
                      <span className="flex-none overflow-hidden"
                        style={{ width: 52, height: 52, borderRadius: 10, background: 'rgba(236,96,66,.1)' }}>
                        {o.etablissement?.photos?.[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={o.etablissement.photos[0]} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center" style={{ color: 'var(--uni-accent)' }}>
                            {o.etablissement ? (
                              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4 5h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" /><path d="M12 12v7" /><path d="M8 19h8" />
                              </svg>
                            ) : (
                              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 22s-7-7.5-7-12a7 7 0 0 1 14 0c0 4.5-7 12-7 12z" /><circle cx="12" cy="10" r="2.5" />
                              </svg>
                            )}
                          </span>
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate" style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', color: 'var(--uni-ink)' }}>
                          {o.nom}
                        </div>
                        <div style={{ marginTop: 2, fontSize: 11.5, lineHeight: 1.4, color: 'var(--uni-dim2)' }}>
                          {o.adresse ?? (o.etablissement ? 'Voir la fiche' : 'Lieu précisé par le théâtre')}
                        </div>
                      </div>
                      {(o.etablissement || (o.lieu?.lat && o.lieu?.lng)) && (
                        <span className="flex-none" style={{ color: 'var(--uni-accent)', opacity: .7 }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </span>
                      )}
                    </>
                  )
                  const cadre = {
                    borderRadius: 14, border: '1px solid var(--uni-line)',
                    background: 'rgba(236,96,66,.06)', padding: 10,
                  }
                  // Une fiche établissement l'emporte : elle porte bien plus que
                  // l'adresse. Sinon l'itinéraire, quand on a de quoi le tracer.
                  if (o.etablissement) {
                    return (
                      <Link key={o.cle} href={`/etablissement/${o.etablissement.id}`}
                        className="flex items-center gap-3 overflow-hidden no-underline" style={cadre}>
                        {dedans}
                      </Link>
                    )
                  }
                  if (o.lieu?.lat && o.lieu?.lng) {
                    return (
                      <a key={o.cle} target="_blank" rel="noopener noreferrer"
                        href={`https://www.google.com/maps/search/?api=1&query=${o.lieu.lat},${o.lieu.lng}`}
                        className="flex items-center gap-3 overflow-hidden no-underline" style={cadre}>
                        {dedans}
                      </a>
                    )
                  }
                  return (
                    <div key={o.cle} className="flex items-center gap-3 overflow-hidden" style={cadre}>
                      {dedans}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {videoOuverte && spectacle?.bande_annonce_url && (
        <BandeAnnonce url={spectacle.bande_annonce_url} titre={spectacle.titre} onClose={() => setVideoOuverte(false)} />
      )}

      <BottomNavBar />
    </div>
  )
}

/**
 * Un jour de représentation, avec son bandeau et ses lignes.
 *
 * Le LIEU passe avant le nom de la salle : une compagnie peut jouer hors les
 * murs — une école, une salle des fêtes — et c'est là qu'il faut se rendre.
 * Une séance scolaire porte sa mention et n'offre pas de réservation : on ne
 * peut pas y venir, personne ne doit se déplacer pour rien.
 */
function Jour({ date, liste, salles, passe }: {
  date: string
  liste: Representation[]
  salles: Map<string, Theatre>
  passe?: boolean
}) {
  return (
    <div>
      <div style={{ padding: '11px 14px', fontSize: 11.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--uni-accent)', background: 'var(--uni-band)', borderBottom: '1px solid var(--uni-line)' }}>
        {jourLisible(date)}
      </div>
      {liste.map(r => {
        const salle = salles.get(r.etablissement_id)
        const lien = r.billetterie_url || salle?.billetterie_url
        return (
          <div key={r.id} className="flex items-center gap-[11px]"
            style={{ padding: '12px 14px', borderBottom: '1px solid rgba(253,246,243,.07)' }}>
            <span className="flex-none" style={{ color: 'var(--uni-accent)', opacity: 0.85 }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 5h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" /><path d="M12 12v7" /><path d="M8 19h8" />
              </svg>
            </span>
            <span className="flex-none font-title tabular-nums" style={{ fontSize: 15, color: 'var(--uni-accent2)' }}>
              {heureLisible(r.heure) ?? '—'}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate" style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', color: 'var(--uni-ink)' }}>
                {r.lieu || salle?.nom || 'Théâtre'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--uni-dim2)', marginTop: 2 }}>
                {[r.lieu && salle?.nom ? salle.nom : salle?.commune, r.note].filter(Boolean).join(' · ')}
              </div>
            </div>
            {r.scolaire ? (
              <span className="flex-none"
                style={{ border: '1px solid var(--uni-line)', borderRadius: 7, padding: '5px 9px', fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--uni-dim2)' }}>
                scolaire
              </span>
            ) : passe ? null : lien ? (
              <a href={lien} target="_blank" rel="noopener noreferrer"
                className="flex-none no-underline"
                style={{ border: '1px solid rgba(236,96,66,.5)', background: 'transparent', borderRadius: 7, padding: '6px 11px', fontSize: 11.5, fontWeight: 700, color: 'var(--uni-accent2)' }}>
                Réserver
              </a>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
