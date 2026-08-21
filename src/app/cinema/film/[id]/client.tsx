'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { toast } from 'sonner'
import BottomNavBar from '@/components/BottomNavBar'
import { formatHeure, type Cinema, type Film, type Seance } from '@/lib/cinema'

/**
 * Fiche film — publique, sans compte.
 *
 * Les séances sont groupées par jour : c'est ainsi qu'on choisit une séance,
 * pas en parcourant une liste plate. Au-delà d'une semaine, on replie — la
 * plupart des gens réservent pour les jours qui viennent.
 */

interface Payload {
  film: Film
  seances: Seance[]
  cinemas: Cinema[]
  aujourdhui: string
}

const fetcher = (u: string) => fetch(u).then(r => r.json())
/** Jours affichés avant de proposer « voir toutes les séances ». */
const JOURS_REPLIES = 7

function jourLisible(date: string): string {
  const s = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date(`${date}T12:00:00Z`))
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default function FilmClient({ id }: { id: string }) {
  const router = useRouter()
  const [tout, setTout] = useState(false)
  const { data, isLoading } = useSWR<Payload>(`/api/cinema/film/${id}`, fetcher)

  const film = data?.film
  const cinemas = useMemo(() => new Map((data?.cinemas ?? []).map(c => [c.id, c])), [data])
  const seances = useMemo(() => data?.seances ?? [], [data])

  const parJour = useMemo(() => {
    const m = new Map<string, Seance[]>()
    for (const s of seances) { const l = m.get(s.date) ?? []; l.push(s); m.set(s.date, l) }
    return Array.from(m.entries())
  }, [seances])

  const joursAffiches = tout ? parJour : parJour.slice(0, JOURS_REPLIES)

  async function partager() {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    try {
      if (navigator.share) await navigator.share({ title: film?.titre, url })
      else { await navigator.clipboard.writeText(url); toast.success('Lien copié.') }
    } catch { /* partage annulé */ }
  }

  return (
    <div className="relative min-h-[100dvh] bg-creme pb-28 font-inter text-texte">
      {/* En-tête : retour et partage, comme sur les fiches événements */}
      <div className="flex items-center justify-between gap-2 bg-white px-3.5 py-2.5"
        style={{ borderBottom: '1px solid #F0EAE0', paddingTop: 'max(10px, env(safe-area-inset-top, 10px))' }}>
        <button onClick={() => router.back()} aria-label="Retour"
          className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-white"
          style={{ border: '1px solid #E8E0D4' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <button onClick={partager} aria-label="Partager"
          className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-white"
          style={{ border: '1px solid #E8E0D4' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="13 6 19 12 13 18" /><path d="M19 12H8a4 4 0 0 0-4 4v2" />
          </svg>
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="h-7 w-7 animate-spin rounded-full border-[3px] border-bord border-t-primary" /></div>
      ) : !film ? (
        <div className="mx-4 mt-6 rounded-[14px] bg-white p-6 text-center" style={{ border: '1px solid #F0EAE0' }}>
          <p className="m-0 text-[14px] font-extrabold text-texte">Film introuvable</p>
        </div>
      ) : (
        <>
          {/* Affiche + informations */}
          <div className="flex gap-3.5 px-4 pt-4">
            <div className="relative w-[118px] shrink-0 overflow-hidden rounded-[12px]"
              style={{ aspectRatio: '2 / 3', background: '#241C15', boxShadow: '0 6px 18px rgba(26,18,9,0.22)' }}>
              {film.affiche_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={film.affiche_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-end p-2">
                  <span className="text-[12px] font-extrabold leading-tight text-[#E8C58A]">{film.titre}</span>
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h1 className="m-0 font-title text-[21px] leading-[1.15] text-texte">{film.titre}</h1>
              {film.titre_original && film.titre_original !== film.titre && (
                <div className="mt-0.5 text-[11.5px] italic text-texte-doux">{film.titre_original}</div>
              )}
              <div className="mt-2 text-[12px] leading-relaxed text-texte-doux">
                {[
                  film.duree_min ? `${film.duree_min} min` : null,
                  film.annee ? String(film.annee) : null,
                  film.genres?.length ? film.genres.join(', ') : null,
                ].filter(Boolean).join(' · ')}
              </div>
              {film.realisateur && (
                <div className="mt-1.5 text-[12px] text-texte">
                  <span className="text-texte-doux">De </span>{film.realisateur}
                </div>
              )}
              {film.casting && (
                <div className="mt-0.5 line-clamp-2 text-[12px] text-texte">
                  <span className="text-texte-doux">Avec </span>{film.casting}
                </div>
              )}
              {film.avertissement && (
                <div className="mt-2 inline-block rounded-[6px] px-2 py-1 text-[10.5px] font-extrabold"
                  style={{ background: '#FFF0E5', color: '#C84B2F' }}>
                  {film.avertissement}
                </div>
              )}
              {film.bande_annonce_url && (
                <a href={film.bande_annonce_url} target="_blank" rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-extrabold text-white no-underline"
                  style={{ background: '#1A1209' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20" /></svg>
                  Bande-annonce
                </a>
              )}
            </div>
          </div>

          {film.synopsis && (
            <div className="px-4 pt-5">
              <h2 className="m-0 mb-1.5 font-title text-[17px] leading-tight">Synopsis</h2>
              <p className="m-0 whitespace-pre-line text-[13.5px] leading-relaxed text-texte">{film.synopsis}</p>
            </div>
          )}

          {/* Séances, groupées par jour */}
          <div className="px-4 pt-5">
            <h2 className="m-0 mb-2 font-title text-[17px] leading-tight">Séances</h2>
            {parJour.length === 0 ? (
              <div className="rounded-[14px] bg-white p-5 text-center" style={{ border: '1px solid #F0EAE0' }}>
                <p className="m-0 text-[13px] text-texte-doux">Aucune séance programmée pour l’instant.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-[14px] bg-white" style={{ border: '1px solid #F0EAE0' }}>
                {joursAffiches.map(([date, liste]) => (
                  <div key={date}>
                    <div className="px-3 py-2 text-[11px] font-extrabold uppercase tracking-[0.05em]"
                      style={{ background: '#F7F1E6', color: '#7A6A5A' }}>
                      {jourLisible(date)}
                    </div>
                    {liste.map(s => {
                      const salle = cinemas.get(s.etablissement_id)
                      const lien = s.billetterie_url || salle?.billetterie_url
                      return (
                        <div key={s.id} className="flex items-center gap-2.5 px-3 py-2.5" style={{ borderTop: '1px solid #F7F1E6' }}>
                          <span className="w-[46px] shrink-0 font-title text-[15px] tabular-nums">{formatHeure(s.heure)}</span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[12.5px] font-bold text-texte">{salle?.nom ?? 'Cinéma'}</div>
                            <div className="text-[11px] text-texte-doux">
                              {s.version.toUpperCase()}{s.salle ? ` · ${s.salle}` : ''}{s.note ? ` · ${s.note}` : ''}
                            </div>
                          </div>
                          {lien && (
                            <a href={lien} target="_blank" rel="noopener noreferrer"
                              className="shrink-0 rounded-full px-3 py-[7px] text-[11.5px] font-extrabold text-white no-underline"
                              style={{ background: '#2D5A3D' }}>
                              Réserver
                            </a>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
                {!tout && parJour.length > JOURS_REPLIES && (
                  <button onClick={() => setTout(true)}
                    className="w-full border-none bg-white py-3 text-[12.5px] font-extrabold text-primary"
                    style={{ borderTop: '1px solid #F0EAE0' }}>
                    Voir toutes les séances ({parJour.length} jours)
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}

      <BottomNavBar />
    </div>
  )
}
