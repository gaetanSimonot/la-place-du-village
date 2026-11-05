'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import BottomNavBar from '@/components/BottomNavBar'
import { useTerritoire } from '@/components/TerritoireProvider'
import IconeChampignon from '@/components/bois/IconeChampignon'
import PastilleStatut from '@/components/bois/PastilleStatut'
import FicheChampignon from '@/components/bois/FicheChampignon'
import {
  COULEURS, MANGEABLES, MILIEUX, libelleMilieu, normaliser,
  type Champignon, type Couleur, type Milieu,
} from '@/lib/champignons'

/**
 * UNIVERS BOIS — « Dans nos bois », le guide des champignons. Public.
 *
 * Le châssis des modules (barre de sortie vers La Place, bottom nav et barre
 * rhabillées par `[data-univers='bois']`), et dedans le guide de terrain qui a
 * servi de source : recherche, trois rangées de filtres (comestibilité,
 * milieu, couleur du chapeau), une grille de fiches, la fiche détaillée en
 * feuille. Les couleurs sont celles du guide, pas celles du cinéma.
 *
 * `?espece=<id>` ouvre directement une fiche : c'est le lien des vignettes
 * du bloc « Dans nos bois » sur la page Village.
 */

type FiltreStatut = 'tous' | 'mangeables' | 'aeviter'

const fetcher = (u: string) => fetch(u).then(r => r.json())

export default function BoisClient() {
  const router = useRouter()
  const [recherche, setRecherche] = useState('')
  const [fStatut, setFStatut] = useState<FiltreStatut>('tous')
  const [fMilieu, setFMilieu] = useState<Milieu | 'tous'>('tous')
  const [fCouleur, setFCouleur] = useState<Couleur | 'toutes'>('toutes')
  const [ouverteId, setOuverteId] = useState<string | null>(null)

  // Le thème vit tant qu'on est sur cette page, et pas une seconde de plus.
  useEffect(() => {
    document.documentElement.dataset.univers = 'bois'
    return () => { delete document.documentElement.dataset.univers }
  }, [])

  // Lecture directe de l'URL : useSearchParams() casse le prérendu (piège connu).
  useEffect(() => {
    try { setOuverteId(new URLSearchParams(window.location.search).get('espece')) } catch { /* noop */ }
  }, [])

  // La ville fait partie de la clé : sans elle, le cache SWR servirait le
  // guide d'un territoire à l'autre.
  const { territoire } = useTerritoire()
  const { data, isLoading } = useSWR<{ especes: Champignon[] }>(
    territoire?.slug ? `/api/champignons?territoire=${encodeURIComponent(territoire.slug)}` : '/api/champignons',
    fetcher, { revalidateOnFocus: false })

  const especes = useMemo(() => data?.especes ?? [], [data])
  const parLatin = useMemo(() => new Map(especes.map(e => [e.nom_latin, e])), [especes])
  const ouverte = ouverteId ? especes.find(e => e.id === ouverteId) ?? null : null

  const liste = useMemo(() => {
    const q = normaliser(recherche.trim())
    return especes.filter(e => {
      if (fStatut === 'mangeables' && !MANGEABLES.has(e.statut)) return false
      if (fStatut === 'aeviter' && MANGEABLES.has(e.statut)) return false
      if (fMilieu !== 'tous' && !e.milieux.includes(fMilieu)) return false
      if (fCouleur !== 'toutes' && !e.couleurs.includes(fCouleur)) return false
      if (q && !normaliser(`${e.nom} ${e.nom_latin} ${e.milieux.map(libelleMilieu).join(' ')}`).includes(q)) return false
      return true
    })
  }, [especes, recherche, fStatut, fMilieu, fCouleur])

  /** Ouvrir ou fermer une fiche. L'URL suit : le lien reste partageable. */
  const ouvrir = useCallback((e: Champignon | null) => {
    setOuverteId(e?.id ?? null)
    try { window.history.replaceState(null, '', e ? `/bois?espece=${e.id}` : '/bois') } catch { /* noop */ }
  }, [])
  const fermer = useCallback(() => ouvrir(null), [ouvrir])

  return (
    <div className="pcv-cine relative min-h-[100dvh] font-alegreyaSans"
      style={{ background: 'var(--uni-bg)', color: 'var(--uni-ink)', paddingBottom: 92 }}>

      {/* Barre de sortie — la porte de retour vers l'app, comme au cinéma. */}
      <div className="flex items-center gap-2.5 px-3.5"
        style={{ paddingTop: 'max(16px, env(safe-area-inset-top, 16px))', paddingBottom: 6 }}>
        <button onClick={() => router.push('/?tab=village')} aria-label="Revenir à La Place"
          className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full"
          style={{ border: '1px solid var(--uni-line)', background: 'var(--uni-creux)', color: 'var(--uni-ink)' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <button onClick={() => router.push('/?tab=village')}
          className="min-w-0 truncate border-none bg-transparent p-0 text-left font-inter"
          style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-.01em', color: 'var(--uni-ink)' }}>
          La Place du Village
        </button>
      </div>

      {/* En-tête du guide */}
      <header style={{ padding: '18px 18px 14px' }}>
        {territoire?.nom && (
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--uni-accent)' }}>
            {territoire.nom}
          </div>
        )}
        <h1 className="m-0 flex items-center font-alegreya"
          style={{ gap: 10, marginTop: 6, marginBottom: 8, fontSize: 36, fontWeight: 700, lineHeight: 1.05 }}>
          <IconeChampignon taille={34} />
          Dans nos bois
        </h1>
        <p className="m-0" style={{ fontSize: 17, lineHeight: 1.5, color: 'var(--uni-dim)', maxWidth: '62ch' }}>
          {especes.length > 0
            ? `${especes.length} espèces de chez nous : les bons comestibles et leurs sosies dangereux. Touchez une fiche pour la détailler.`
            : 'Les champignons de chez nous : les bons comestibles et leurs sosies dangereux.'}
        </p>
        {/* L'avertissement n'est pas négociable : un guide ne suffit jamais. */}
        <div style={{ marginTop: 16, border: '1px solid var(--bois-dead)', background: 'var(--bois-deadBg)', borderRadius: 10, padding: '12px 14px', fontSize: 15, lineHeight: 1.45, maxWidth: '72ch' }}>
          <strong style={{ color: 'var(--bois-dead)' }}>Ce guide ne suffit pas pour décider de manger un champignon.</strong>{' '}
          Faites toujours vérifier votre cueillette par un pharmacien ou une société mycologique. En cas de malaise après un repas de champignons, appelez le 15 et gardez les restes.
        </div>
      </header>

      {/* Barre de filtres, collante comme dans le guide. */}
      <div role="search" className="sticky flex flex-col"
        style={{ top: 0, zIndex: 5, gap: 10, padding: '12px 18px', background: 'var(--uni-bg)', borderBottom: '1px solid var(--uni-line)' }}>
        <div className="flex items-center" style={{ gap: 8 }}>
          <input type="search" value={recherche} onChange={e => setRecherche(e.target.value)}
            placeholder="Girolle, Boletus, pins…" aria-label="Rechercher une espèce"
            className="min-w-0 flex-1 font-alegreyaSans"
            style={{ fontSize: 16, padding: '9px 12px', borderRadius: 999, border: '1px solid var(--uni-line)', background: 'var(--uni-panel)', color: 'var(--uni-ink)', outline: 'none' }} />
          <span className="flex-none tabular-nums" style={{ fontSize: 14, color: 'var(--uni-dim)' }}>
            {liste.length} espèce{liste.length > 1 ? 's' : ''}
          </span>
        </div>
        <Rangee label="Filtrer par comestibilité">
          {([['tous', 'Tous'], ['mangeables', 'Comestibles'], ['aeviter', 'Toxiques et non comestibles']] as const).map(([v, l]) => (
            <Puce key={v} actif={fStatut === v} onClick={() => setFStatut(v)}>{l}</Puce>
          ))}
        </Rangee>
        <Rangee label="Filtrer par milieu">
          <Puce actif={fMilieu === 'tous'} onClick={() => setFMilieu('tous')}>Tous milieux</Puce>
          {MILIEUX.map(m => (
            <Puce key={m.id} actif={fMilieu === m.id} onClick={() => setFMilieu(m.id)}>{m.court}</Puce>
          ))}
        </Rangee>
        <Rangee label="Filtrer par couleur du chapeau" defile>
          <Puce actif={fCouleur === 'toutes'} onClick={() => setFCouleur('toutes')}>Toutes couleurs</Puce>
          {COULEURS.map(c => (
            <Puce key={c.id} actif={fCouleur === c.id} onClick={() => setFCouleur(c.id)}>
              <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: '50%', border: '1px solid var(--uni-line)', background: c.teinte, flex: 'none' }} />
              {c.label}
            </Puce>
          ))}
        </Rangee>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-7 w-7 animate-spin rounded-full"
            style={{ border: '3px solid var(--uni-tint2)', borderTopColor: 'var(--uni-accent)' }} />
        </div>
      ) : especes.length === 0 ? (
        <p className="px-[18px] py-10 text-center" style={{ fontSize: 15, color: 'var(--uni-dim)' }}>
          Le guide de ce territoire n’est pas encore publié.
        </p>
      ) : liste.length === 0 ? (
        <p className="px-[18px] py-8" style={{ fontSize: 15, color: 'var(--uni-dim)' }}>
          Aucune espèce ne correspond. Essayez un autre milieu ou un autre nom.
        </p>
      ) : (
        <main className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 160px), 1fr))', gap: 14, padding: '18px 18px 0' }}>
          {liste.map(e => (
            <button key={e.id} onClick={() => ouvrir(e)} aria-label={`${e.nom}`}
              className="flex min-w-0 flex-col overflow-hidden p-0 text-left font-alegreyaSans"
              style={{ background: 'var(--uni-panel)', border: '1px solid var(--uni-line)', borderRadius: 12, color: 'var(--uni-ink)', cursor: 'pointer' }}>
              <span className="relative block w-full" style={{ aspectRatio: '4 / 3', background: 'var(--uni-vide)' }}>
                {e.photo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.photo_url} alt={e.nom} loading="lazy" className="block h-full w-full object-cover" />
                )}
                <PastilleStatut statut={e.statut} style={{ position: 'absolute', left: 8, top: 8 }} />
              </span>
              <span className="flex min-w-0 flex-col" style={{ padding: '10px 12px 12px', gap: 2 }}>
                <span className="font-alegreya" style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.15 }}>{e.nom}</span>
                <span className="font-alegreya" style={{ fontStyle: 'italic', fontSize: 15, color: 'var(--uni-dim)' }}>{e.nom_latin}</span>
                {e.saison && <span style={{ marginTop: 4, fontSize: 13, color: 'var(--uni-dim)' }}>{e.saison}</span>}
              </span>
            </button>
          ))}
        </main>
      )}

      {especes.length > 0 && (
        <footer className="flex flex-col" style={{ gap: 8, margin: '36px 18px 0', fontSize: 14, color: 'var(--uni-dim)', maxWidth: '72ch' }}>
          <p className="m-0">
            Sélection faite à partir des observations validées sur iNaturalist, complétée par les espèces dangereuses à connaître absolument.
          </p>
          <p className="m-0">
            Photos sous licence libre (CC0, CC BY ou CC BY-SA) issues d’
            <a href="https://www.inaturalist.org" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--uni-accent)' }}>iNaturalist</a>.
            L’auteur et la licence sont indiqués sur chaque fiche.
          </p>
        </footer>
      )}

      {ouverte && <FicheChampignon espece={ouverte} parLatin={parLatin} onOuvrir={ouvrir} onFermer={fermer} />}

      <BottomNavBar />
    </div>
  )
}

/* ─── Briques ─────────────────────────────────────────────────────────── */

function Rangee({ label, defile, children }: { label: string; defile?: boolean; children: React.ReactNode }) {
  return (
    <div aria-label={label} className={`flex items-center ${defile ? 'flex-nowrap overflow-x-auto' : 'flex-wrap'}`}
      style={{ gap: 8, scrollbarWidth: 'none' }}>
      {children}
    </div>
  )
}

/** Puce de filtre : pleine à l'encre quand elle est choisie, comme dans le guide. */
function Puce({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={actif}
      className="inline-flex flex-none items-center whitespace-nowrap font-alegreyaSans"
      style={{
        gap: 6, fontSize: 14, padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
        border: `1px solid ${actif ? 'var(--uni-ink)' : 'var(--uni-line)'}`,
        background: actif ? 'var(--uni-ink)' : 'var(--uni-panel)',
        color: actif ? 'var(--uni-bg)' : 'var(--uni-ink)',
      }}>
      {children}
    </button>
  )
}
