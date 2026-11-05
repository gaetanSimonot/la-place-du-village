'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import BottomNavBar from '@/components/BottomNavBar'
import { useTerritoire } from '@/components/TerritoireProvider'
import IconeChampignon from '@/components/bois/IconeChampignon'
import PastilleStatut from '@/components/bois/PastilleStatut'
import FicheChampignon from '@/components/bois/FicheChampignon'
import BoutonPartager from '@/components/bois/BoutonPartager'
import {
  COULEURS, MANGEABLES, MILIEUX, libelleMilieu, normaliser,
  type Champignon, type Couleur, type Milieu,
} from '@/lib/champignons'

/**
 * UNIVERS BOIS — « Dans nos bois », le guide des champignons. Public.
 *
 * La MISE EN PAGE et la TYPO sont celles des rubriques du site (Petites
 * annonces) : barre retour · titre centré · action, champ de recherche blanc
 * avec son bouton « Filtres », pastilles qui défilent. Seules les COULEURS
 * viennent du guide d'origine (univers `bois`, bottom nav comprise).
 *
 * Filtres : la comestibilité reste toujours visible (c'est la question qu'on
 * se pose) ; le milieu et la couleur du chapeau se déplient sous « Filtres ».
 *
 * `?espece=<id>` ouvre directement une fiche : c'est le lien des vignettes
 * du bloc « Dans nos bois » sur la page Village.
 */

type FiltreStatut = 'tous' | 'mangeables' | 'aeviter'

const STATUTS_FILTRE: { id: FiltreStatut; label: string; actif: string }[] = [
  { id: 'tous',       label: 'Tout',        actif: 'var(--uni-ink)' },
  { id: 'mangeables', label: 'Comestibles', actif: 'var(--bois-ok)' },
  { id: 'aeviter',    label: 'À éviter',    actif: 'var(--bois-tox)' },
]

const fetcher = (u: string) => fetch(u).then(r => r.json())

export default function BoisClient() {
  const router = useRouter()
  const [recherche, setRecherche] = useState('')
  const [fStatut, setFStatut] = useState<FiltreStatut>('tous')
  const [fMilieu, setFMilieu] = useState<Milieu | null>(null)
  const [fCouleur, setFCouleur] = useState<Couleur | null>(null)
  const [filtresOuverts, setFiltresOuverts] = useState(false)
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
  const nbFiltres = (fMilieu ? 1 : 0) + (fCouleur ? 1 : 0)

  const liste = useMemo(() => {
    const q = normaliser(recherche.trim())
    return especes.filter(e => {
      if (fStatut === 'mangeables' && !MANGEABLES.has(e.statut)) return false
      if (fStatut === 'aeviter' && MANGEABLES.has(e.statut)) return false
      if (fMilieu && !e.milieux.includes(fMilieu)) return false
      if (fCouleur && !e.couleurs.includes(fCouleur)) return false
      if (q && !normaliser(`${e.nom} ${e.nom_latin} ${e.milieux.map(libelleMilieu).join(' ')}`).includes(q)) return false
      return true
    })
  }, [especes, recherche, fStatut, fMilieu, fCouleur])

  /**
   * Ouvrir ou fermer une fiche. L'URL suit, le lien reste partageable, et le
   * RETOUR DU TÉLÉPHONE referme la fiche au lieu de quitter le guide : ouvrir
   * depuis la liste pousse une entrée d'historique, passer à un sosie la
   * remplace (le retour ramène toujours à la liste, jamais de sosie en
   * sosie). Fermer avec la flèche défait l'entrée poussée.
   */
  const poussee = useRef(false)
  const ouvrir = useCallback((e: Champignon) => {
    setOuverteId(e.id)
    try {
      if (poussee.current) window.history.replaceState(null, '', `/bois?espece=${e.id}`)
      else { window.history.pushState(null, '', `/bois?espece=${e.id}`); poussee.current = true }
    } catch { /* noop */ }
  }, [])
  const fermer = useCallback(() => {
    if (poussee.current) { window.history.back(); return }
    // Fiche ouverte par un lien direct : pas d'entrée à défaire.
    setOuverteId(null)
    try { window.history.replaceState(null, '', '/bois') } catch { /* noop */ }
  }, [])

  // Le retour (flèche ou téléphone) relit l'URL : sans `espece`, la fiche se ferme.
  useEffect(() => {
    const relire = () => {
      poussee.current = false
      try { setOuverteId(new URLSearchParams(window.location.search).get('espece')) } catch { /* noop */ }
    }
    window.addEventListener('popstate', relire)
    return () => window.removeEventListener('popstate', relire)
  }, [])

  return (
    <div className="pcv-cine relative min-h-[100dvh] font-inter"
      style={{ background: 'var(--uni-bg)', color: 'var(--uni-ink)', paddingBottom: 92 }}>

      {/* ─── Barre du haut : retour · titre · partage (comme les annonces) ─── */}
      <div className="flex items-center justify-between gap-2.5 px-4"
        style={{ paddingTop: 'max(14px, env(safe-area-inset-top, 14px))' }}>
        <button onClick={() => router.push('/?tab=village')} aria-label="Revenir à La Place"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ border: '1px solid var(--uni-line)', background: 'var(--uni-panel)', color: 'var(--uni-ink)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
        </button>

        <div className="flex min-w-0 flex-1 flex-col items-center gap-px">
          <h1 className="m-0 flex items-center gap-1.5 font-serif text-[20px] leading-none" style={{ letterSpacing: '-0.01em', color: 'var(--uni-ink)' }}>
            Dans nos bois
            <IconeChampignon taille={17} epaisseur={1.8} />
          </h1>
          <div className="text-[12px] font-semibold" style={{ color: 'var(--uni-dim)' }}>
            Le guide des champignons
          </div>
        </div>

        <BoutonPartager titre="Dans nos bois — les champignons de chez nous"
          url={() => `${window.location.origin}/bois`} />
      </div>

      {/* ─── L'avertissement, non négociable : un guide ne suffit jamais ─── */}
      <div className="mx-4 mt-4 flex gap-2.5 rounded-2xl"
        style={{ padding: '11px 13px', background: 'var(--bois-deadBg)', color: 'var(--uni-ink)' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--bois-dead)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="mt-px shrink-0">
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <p className="m-0 text-[12.5px] leading-[1.45]">
          <strong style={{ color: 'var(--bois-dead)' }}>Ce guide ne suffit pas pour décider de manger un champignon.</strong>{' '}
          Faites vérifier votre cueillette par un pharmacien ou une société mycologique. Malaise après un repas de champignons : appelez le 15 et gardez les restes.
        </p>
      </div>

      {/* ─── Recherche + bouton Filtres ─── */}
      <div className="px-4 pt-4">
        <div className="flex items-center gap-1 rounded-2xl px-3.5 py-1"
          style={{ border: '1px solid var(--uni-line)', background: 'var(--uni-panel)', boxShadow: '0 1px 4px rgba(30,36,31,0.05)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" style={{ color: 'var(--uni-dim2)' }}>
            <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input value={recherche} onChange={e => setRecherche(e.target.value)}
            placeholder="Girolle, cèpe, pins…" aria-label="Rechercher une espèce"
            className="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-[14px] outline-none"
            style={{ color: 'var(--uni-ink)' }} />
          {recherche && (
            <button type="button" onClick={() => setRecherche('')} aria-label="Effacer la recherche"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ color: 'var(--uni-dim)' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          )}
          <div className="mx-1 h-6 w-px shrink-0" style={{ background: 'var(--uni-line)' }} aria-hidden />
          <button type="button" onClick={() => setFiltresOuverts(o => !o)} aria-expanded={filtresOuverts}
            className="inline-flex shrink-0 items-center gap-1.5 py-2 text-[13px] font-bold" style={{ color: 'var(--uni-ink)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="11" y2="6" /><line x1="14" y1="6" x2="20" y2="6" />
              <line x1="4" y1="12" x2="7" y2="12" /><line x1="10" y1="12" x2="20" y2="12" />
              <line x1="4" y1="18" x2="14" y2="18" /><line x1="17" y1="18" x2="20" y2="18" />
              <circle cx="12.5" cy="6" r="2" /><circle cx="8.5" cy="12" r="2" /><circle cx="15.5" cy="18" r="2" />
            </svg>
            Filtres
            {nbFiltres > 0 && (
              <span className="inline-flex h-[14px] min-w-[16px] items-center justify-center rounded-full px-1.5 text-[10px] font-extrabold leading-none text-white"
                style={{ background: 'var(--uni-accent)' }}>{nbFiltres}</span>
            )}
          </button>
        </div>
      </div>

      {/* ─── Comestibilité, toujours visible ─── */}
      <div className="flex gap-1.5 overflow-x-auto px-4 pt-3.5" style={{ scrollbarWidth: 'none' }}>
        {STATUTS_FILTRE.map(s => {
          const actif = fStatut === s.id
          return (
            <button key={s.id} type="button" onClick={() => setFStatut(s.id)}
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-[12px] font-bold"
              style={{
                border: `1.5px solid ${actif ? s.actif : 'var(--uni-line)'}`,
                background: actif ? s.actif : 'var(--uni-panel)',
                color: actif ? '#FFFFFF' : 'var(--uni-dim)',
              }}>
              {s.id !== 'tous' && (
                <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: actif ? '#FFFFFF' : s.actif }} />
              )}
              {s.label}
            </button>
          )
        })}
      </div>

      {/* ─── Milieu et couleur, dépliés par « Filtres » ─── */}
      {filtresOuverts && (
        <div className="mx-4 mt-3 rounded-2xl"
          style={{ padding: '12px 14px 14px', background: 'var(--uni-panel)', border: '1px solid var(--uni-line)' }}>
          <Etiquette>Où pousse-t-il ?</Etiquette>
          <div className="flex flex-wrap gap-1.5">
            {MILIEUX.map(m => {
              const actif = fMilieu === m.id
              return (
                <button key={m.id} type="button" onClick={() => setFMilieu(actif ? null : m.id)}
                  className="whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-bold"
                  style={{
                    border: `1.5px solid ${actif ? 'var(--uni-accent)' : 'var(--uni-line)'}`,
                    background: actif ? 'var(--uni-tint2)' : 'transparent',
                    color: actif ? 'var(--uni-accent2)' : 'var(--uni-dim)',
                  }}>
                  {m.court}
                </button>
              )
            })}
          </div>

          <Etiquette style={{ marginTop: 14 }}>Couleur du chapeau</Etiquette>
          <div className="flex flex-wrap gap-2.5">
            {COULEURS.map(c => {
              const actif = fCouleur === c.id
              return (
                <button key={c.id} type="button" onClick={() => setFCouleur(actif ? null : c.id)}
                  aria-label={c.label} aria-pressed={actif} title={c.label}
                  className="flex flex-col items-center gap-1 border-none bg-transparent p-0" style={{ width: 52 }}>
                  <span className="flex items-center justify-center rounded-full"
                    style={{
                      width: 34, height: 34, background: c.teinte,
                      boxShadow: actif ? '0 0 0 2px var(--uni-panel), 0 0 0 4px var(--uni-accent)' : 'inset 0 0 0 1px rgba(30,36,31,.18)',
                    }}>
                    {actif && (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.id === 'blanc' || c.id === 'jaune' ? '#1E241F' : '#FFFFFF'} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </span>
                  <span className="text-[10.5px] font-semibold leading-tight" style={{ color: actif ? 'var(--uni-accent2)' : 'var(--uni-dim)' }}>
                    {c.label.split(',')[0]}
                  </span>
                </button>
              )
            })}
          </div>

          {nbFiltres > 0 && (
            <button type="button" onClick={() => { setFMilieu(null); setFCouleur(null) }}
              className="mt-3 border-none bg-transparent p-0 text-[12px] font-bold underline" style={{ color: 'var(--uni-accent)' }}>
              Effacer les filtres
            </button>
          )}
        </div>
      )}

      {/* ─── Titre de section + compteur ─── */}
      <div className="flex items-baseline justify-between px-4 pb-1 pt-5">
        <h2 className="m-0 font-serif text-[18px] font-bold leading-none" style={{ letterSpacing: '-0.01em', color: 'var(--uni-ink)' }}>
          Les espèces
        </h2>
        <span className="text-[12px] font-semibold tabular-nums" style={{ color: 'var(--uni-dim)' }}>
          {liste.length} / {especes.length}
        </span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-7 w-7 animate-spin rounded-full"
            style={{ border: '3px solid var(--uni-tint2)', borderTopColor: 'var(--uni-accent)' }} />
        </div>
      ) : especes.length === 0 ? (
        <p className="px-4 py-10 text-center text-[14px] font-bold" style={{ color: 'var(--uni-dim)' }}>
          Le guide de ce territoire n’est pas encore publié.
        </p>
      ) : liste.length === 0 ? (
        <p className="px-4 py-10 text-center text-[14px] font-bold" style={{ color: 'var(--uni-dim)' }}>
          Aucune espèce ne correspond. Essayez un autre milieu ou un autre nom.
        </p>
      ) : (
        <main className="grid px-4 pt-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 155px), 1fr))', gap: 12 }}>
          {liste.map(e => (
            <button key={e.id} onClick={() => ouvrir(e)} aria-label={e.nom}
              className="flex min-w-0 flex-col overflow-hidden rounded-2xl p-0 text-left"
              style={{ background: 'var(--uni-panel)', border: '1px solid var(--uni-line)', color: 'var(--uni-ink)', boxShadow: '0 1px 4px rgba(30,36,31,0.05)' }}>
              <span className="relative block w-full" style={{ aspectRatio: '4 / 3', background: 'var(--uni-vide)' }}>
                {e.photo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.photo_url} alt={e.nom} loading="lazy" className="block h-full w-full object-cover" />
                )}
                <PastilleStatut statut={e.statut} compacte style={{ position: 'absolute', left: 7, top: 7 }} />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5 px-3 pb-3 pt-2.5">
                <span className="font-title text-[14px] font-bold leading-tight">{e.nom}</span>
                <span className="truncate text-[11.5px] italic" style={{ color: 'var(--uni-dim)' }}>{e.nom_latin}</span>
                {e.saison && <span className="mt-1 text-[11px] font-semibold" style={{ color: 'var(--uni-dim2)' }}>{e.saison}</span>}
              </span>
            </button>
          ))}
        </main>
      )}

      {especes.length > 0 && (
        <p className="m-0 px-4 pt-8 text-[11.5px] leading-[1.5]" style={{ color: 'var(--uni-dim2)' }}>
          Sélection faite à partir des observations validées sur iNaturalist, complétée par les espèces dangereuses à connaître absolument.
          Photos sous licence libre (CC0, CC BY ou CC BY-SA) issues d’
          <a href="https://www.inaturalist.org" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--uni-accent)' }}>iNaturalist</a>
          ; l’auteur et la licence sont indiqués sur chaque fiche.
        </p>
      )}

      {ouverte && <FicheChampignon espece={ouverte} parLatin={parLatin} onOuvrir={ouvrir} onFermer={fermer} />}

      <BottomNavBar />
    </div>
  )
}

function Etiquette({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="mb-2 text-[10.5px] font-extrabold uppercase" style={{ letterSpacing: '.08em', color: 'var(--uni-accent)', ...style }}>
      {children}
    </div>
  )
}
