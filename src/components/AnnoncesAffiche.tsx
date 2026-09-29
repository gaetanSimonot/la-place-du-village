'use client'
import Link from 'next/link'
import useSWR from 'swr'
import { useTerritoire } from '@/components/TerritoireProvider'
import { useDefilementDoux } from '@/hooks/useDefilementDoux'
import TitreVivant from '@/components/village/TitreVivant'
import { getPrixAffiche, CATEGORIES_LABELS, type Annonce } from '@/lib/annonces'

/**
 * Bloc « Petites annonces » — une rubrique du flux du Village, sur le modèle
 * exact du cinéma et du théâtre : titre, « Voir tout », et un rouleau de
 * cartes qui avance tout seul, très doucement (useDefilementDoux), qu'on
 * pousse au doigt.
 *
 * Les annonces viennent de /api/annonces, telles que la page Annonces les
 * montre : celles du territoire, les sponsorisées d'abord, puis les plus
 * récentes. L'ordre est à revoir plus tard — c'est la route qui le porte.
 *
 * Le bloc disparaît quand il n'y a aucune annonce : jamais de rubrique vide.
 */
const NB = 20

const fetcher = async (u: string) => {
  const r = await fetch(u)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

export default function AnnoncesAffiche() {
  const { territoire } = useTerritoire()
  const qTerr = territoire?.slug ? `&territoire=${encodeURIComponent(territoire.slug)}` : ''
  const { data } = useSWR<{ annonces: Annonce[] }>(`/api/annonces?limit=${NB}${qTerr}`, fetcher, { revalidateOnFocus: false })
  const annonces = data?.annonces ?? []

  // Le rouleau avance tout seul, très doucement (téléphone ; cf. le hook).
  const piste = useDefilementDoux<HTMLDivElement>(annonces.length)

  if (annonces.length === 0) return null

  return (
    <>
      <div className="pcv-bh flex items-baseline justify-between gap-2.5 px-4 pb-2.5 pt-[18px]">
        <div>
          <h2 className="m-0 font-serif text-[20px] leading-[1.15] text-texte" style={{ letterSpacing: '-0.02em' }}>
            <TitreVivant texte="Petites annonces" />
          </h2>
          <div className="pcv-sub pcv-only">Ce qui se vend, se donne et s’échange près de chez vous</div>
        </div>
        <Link href="/annonces" className="pcv-more flex shrink-0 items-center gap-1 text-[12.5px] font-bold no-underline" style={{ color: '#2D5A3D' }}>
          Voir tout
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" /><polyline points="13 6 19 12 13 18" />
          </svg>
        </Link>
      </div>

      {/* Le cadre de la piste : sur téléphone, elle y glisse (useDefilementDoux)
          au lieu de défiler — une zone défilante captait le glissé vertical.
          Liste écrite deux fois : la copie (lpv-defileDup) referme la boucle. */}
      <div>
      <div ref={piste} className="flex items-stretch gap-2.5 lg:overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
        {[...annonces, ...annonces].map((a, i) => {
          const copie = i >= annonces.length
          const photo = a.photos?.[0]
          return (
            <Link key={`${a.id}-${i}`} href={`/annonces/${a.id}`}
              className={`block shrink-0 overflow-hidden rounded-[12px] bg-white no-underline${copie ? ' lpv-defileDup' : ''}`}
              aria-hidden={copie} tabIndex={copie ? -1 : undefined}
              style={{ width: 132, boxShadow: '0 2px 8px rgba(44,28,16,.12)' }}>
              {/* `display:block` obligatoire : sur un span inline, `aspect-ratio`
                  ne s'applique pas et la vignette s'écrase. */}
              <span className="relative block w-full"
                style={{ aspectRatio: '1 / 1', background: 'linear-gradient(160deg,#EFE7DA,#E2D6C4)' }}>
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt={a.titre} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <span className="flex h-full w-full items-end p-2">
                    <span className="text-[11px] font-extrabold uppercase tracking-[0.06em]" style={{ color: '#7A6A5A' }}>
                      {CATEGORIES_LABELS[a.categorie] ?? 'Annonce'}
                    </span>
                  </span>
                )}
              </span>
              <span className="block px-2 pb-2 pt-1.5">
                <span className="block truncate text-[13px] font-extrabold" style={{ color: '#C84B2F' }}>{getPrixAffiche(a)}</span>
                {/* Hauteurs FIXES : titre sur deux lignes réservées, ville
                    toujours présente — toutes les cartes font la même taille,
                    qu'un titre tienne sur une ligne ou non. */}
                <span className="mt-0.5 line-clamp-2 block text-[12.5px] font-semibold leading-[1.3]" style={{ color: '#1A1209', height: '2.6em' }}>{a.titre}</span>
                <span className="mt-0.5 block truncate text-[11px]" style={{ color: '#7A6A5A' }}>{a.ville || ' '}</span>
              </span>
            </Link>
          )
        })}
      </div>
      </div>
    </>
  )
}
