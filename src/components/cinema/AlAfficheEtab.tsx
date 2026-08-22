'use client'
import { useMemo } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import type { Cinema, Film, Seance, VisibiliteCinema } from '@/lib/cinema'

/**
 * « À l'affiche » sur la fiche d'un établissement qui a le module cinéma.
 *
 * Un avant-goût de la salle, posé dans une fiche qui reste claire : le
 * panneau porte les couleurs du cinéma sans que la page bascule. La bascule
 * complète, elle, se fait en entrant — c'est tout l'intérêt du bouton.
 *
 * Le composant disparaît s'il n'y a rien à l'affiche : une fiche ne doit pas
 * afficher un cadre vide.
 *
 * Visibilité : le même réglage à trois états que le bloc du Village, et le
 * même interrupteur en admin. Tant que le cinéma est en rodage, le public ne
 * doit pas tomber dessus par la fiche de l'établissement — un seul endroit à
 * cocher, deux endroits qui obéissent.
 */

interface Payload {
  cinema: Cinema | null
  films: Film[]
  seances: Seance[]
  villageVisibilite: VisibiliteCinema
}

const fetcher = (u: string) => fetch(u).then(r => r.json())

export default function AlAfficheEtab({ etabId, isAdmin = false }: { etabId: string; isAdmin?: boolean }) {
  // L'API accepte l'id aussi bien que le slug : on passe l'id, seule clé dont
  // on soit certain ici.
  const { data } = useSWR<Payload>(`/api/cinema?cinema=${encodeURIComponent(etabId)}`, fetcher, {
    revalidateOnFocus: false,
  })

  /** Films à l'affiche, dans l'ordre de leur prochaine séance. */
  const films = useMemo(() => {
    const parId = new Map((data?.films ?? []).map(f => [f.id, f]))
    const vus = new Set<string>()
    const out: Film[] = []
    for (const s of data?.seances ?? []) {
      if (vus.has(s.film_id)) continue
      const f = parId.get(s.film_id)
      if (f) { vus.add(s.film_id); out.push(f) }
    }
    return out
  }, [data])

  // Réglage de visibilité — masqué l'emporte sur tout, y compris pour un admin.
  if (data) {
    if (data.villageVisibilite === 'masque') return null
    if (data.villageVisibilite === 'admin' && !isAdmin) return null
  }

  // La fiche demandée n'est pas celle qu'on a reçue : le module a été retiré
  // entre-temps, ou l'identifiant ne correspond plus. On n'affiche rien.
  if (!data?.cinema || (data.cinema.id !== etabId)) return null

  const lien = `/cinema?cinema=${data.cinema.slug ?? data.cinema.id}`

  return (
    <div className="overflow-hidden" style={{ borderRadius: 18, background: '#12171C', border: '1px solid rgba(157,207,238,.18)' }}>
      <div className="flex items-baseline justify-between" style={{ padding: '15px 15px 10px' }}>
        <span className="font-title" style={{ fontSize: 17, fontWeight: 700, color: '#FAFBFA', letterSpacing: '-.01em' }}>
          À l’affiche
        </span>
        {films.length > 0 && (
          <span style={{ fontSize: 11.5, fontWeight: 600, color: 'rgba(250,251,250,.42)' }}>
            {films.length} film{films.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {films.length > 0 ? (
        <div className="flex gap-2.5 overflow-x-auto" style={{ padding: '0 15px 14px', scrollbarWidth: 'none' }}>
          {films.map(f => (
            <Link key={f.id} href={`/cinema/film/${f.id}`} className="flex-none no-underline">
              <div className="relative overflow-hidden"
                style={{
                  width: 84, aspectRatio: '2 / 3', borderRadius: 10,
                  background: 'linear-gradient(160deg,#1E2C3A,#0E1318)',
                  border: '1px solid rgba(157,207,238,.14)',
                }}>
                {f.affiche_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.affiche_url} alt={f.titre} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <span className="absolute bottom-1.5 left-1.5 right-1.5 line-clamp-3"
                    style={{ fontSize: 9.5, fontWeight: 700, lineHeight: 1.2, color: 'rgba(250,251,250,.72)' }}>
                    {f.titre}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p style={{ margin: 0, padding: '0 15px 14px', fontSize: 12, color: 'rgba(250,251,250,.6)' }}>
          Le programme n’est pas encore publié.
        </p>
      )}

      <Link href={lien} className="flex items-center justify-center gap-2 no-underline"
        style={{
          borderTop: '1px solid rgba(157,207,238,.15)',
          background: 'rgba(157,207,238,.08)',
          padding: 14, fontSize: 13.5, fontWeight: 800, color: '#B4DDF6',
        }}>
        Entrer au cinéma
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="12" x2="19" y2="12" /><polyline points="13 6 19 12 13 18" />
        </svg>
      </Link>
    </div>
  )
}
