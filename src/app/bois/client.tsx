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
import FiltresBois, { type Bascule, type Panneau } from '@/components/bois/FiltresBois'
import {
  COULEURS, MANGEABLES, MILIEUX, libelleMilieu, normaliser,
  type Champignon, type Couleur, type Milieu,
} from '@/lib/champignons'

/**
 * UNIVERS BOIS — « Dans nos bois », le guide des champignons. Public.
 *
 * Composé d'après le visuel de communication de Gaëtan : un EN-TÊTE PHOTO
 * (titre, sous-titre, recherche en pastille blanche), puis les QUATRE PORTES
 * en ronds de couleur (Par couleur, Par milieu, Recettes & cuisine, Sosies
 * maléfiques), puis la GRILLE. Typo du site (Jakarta / Inter), couleurs du
 * guide (univers `bois`, bottom nav comprise).
 *
 * La photo de l'en-tête vient du guide lui-même (la première espèce
 * « excellente » qui a une photo) : rien d'écrit en dur.
 *
 * `?espece=<id>` ouvre directement une fiche : c'est le lien des vignettes
 * du bloc « Dans nos bois » sur la page Village.
 */

const fetcher = (u: string) => fetch(u).then(r => r.json())

export default function BoisClient() {
  const router = useRouter()
  const [recherche, setRecherche] = useState('')
  const [panneau, setPanneau] = useState<Panneau>(null)
  const [bascule, setBascule] = useState<Bascule>(null)
  const [fMilieu, setFMilieu] = useState<Milieu | null>(null)
  const [fCouleur, setFCouleur] = useState<Couleur | null>(null)
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
  const fond = useMemo(
    () => especes.find(e => e.statut === 'excellent' && e.photo_url)?.photo_url ?? especes.find(e => e.photo_url)?.photo_url ?? null,
    [especes])

  const liste = useMemo(() => {
    const q = normaliser(recherche.trim())
    return especes.filter(e => {
      if (bascule === 'recettes' && !e.cuisine) return false
      if (bascule === 'sosies' && MANGEABLES.has(e.statut)) return false
      if (fMilieu && !e.milieux.includes(fMilieu)) return false
      if (fCouleur && !e.couleurs.includes(fCouleur)) return false
      if (q && !normaliser(`${e.nom} ${e.nom_latin} ${e.milieux.map(libelleMilieu).join(' ')}`).includes(q)) return false
      return true
    })
  }, [especes, recherche, bascule, fMilieu, fCouleur])

  /** Ce qui filtre en ce moment, en mots — et de quoi tout effacer. */
  const actifs = [
    bascule === 'recettes' ? 'Recettes & cuisine' : null,
    bascule === 'sosies' ? 'Sosies maléfiques' : null,
    fCouleur ? COULEURS.find(c => c.id === fCouleur)?.label.split(',')[0] : null,
    fMilieu ? MILIEUX.find(m => m.id === fMilieu)?.court : null,
  ].filter(Boolean) as string[]
  /**
   * UNE PORTE À LA FOIS (demande de Gaëtan) : passer d'un filtre à l'autre
   * referme et efface le précédent. Refermer le volet qu'on vient d'ouvrir,
   * en revanche, garde le choix qu'on y a fait.
   */
  const changerPanneau = (p: Panneau) => {
    if (p === null) { setPanneau(null); return }
    setBascule(null)
    if (p === 'couleur') setFMilieu(null)
    if (p === 'milieu') setFCouleur(null)
    setPanneau(p)
  }
  const changerBascule = (b: Bascule) => {
    setPanneau(null); setFCouleur(null); setFMilieu(null)
    setBascule(b)
  }
  const toutEffacer = () => { setBascule(null); setFCouleur(null); setFMilieu(null); setPanneau(null); setRecherche('') }

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

      {/* ─── En-tête photo ─── */}
      <header className="relative overflow-hidden"
        style={{ background: '#22301F', paddingTop: 'max(14px, env(safe-area-inset-top, 14px))' }}>
        {fond && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fond} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
        )}
        {/* Voile : sombre en haut pour les boutons et le titre, fondu dans le
            sauge en bas pour que la pastille de recherche y repose. */}
        <span aria-hidden className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, rgba(14,20,15,.55) 0%, rgba(14,20,15,.42) 45%, rgba(14,20,15,.62) 80%, rgba(14,20,15,.7) 100%)' }} />

        <div className="relative flex items-center justify-between px-4">
          <button onClick={() => router.push('/?tab=village')} aria-label="Revenir à La Place"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ border: '1px solid rgba(255,255,255,.28)', background: 'rgba(16,20,17,.35)', color: '#FFFFFF', backdropFilter: 'blur(6px)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
          <BoutonPartager surPhoto titre="Dans nos bois — les champignons de chez nous"
            url={() => `${window.location.origin}/bois`} />
        </div>

        <div className="relative flex flex-col items-center px-5 pb-6 pt-1 text-center text-white">
          <IconeChampignon taille={42} couleur="#FFFFFF" epaisseur={1.7} />
          <h1 className="m-0 mt-1.5 font-serif text-[34px] leading-[1.05]"
            style={{ letterSpacing: '-0.02em', textShadow: '0 2px 12px rgba(0,0,0,.35)' }}>
            Dans nos bois
          </h1>
          <p className="m-0 mt-1.5 text-[14px] font-semibold" style={{ color: 'rgba(255,255,255,.88)', textShadow: '0 1px 6px rgba(0,0,0,.35)' }}>
            Le guide des champignons{territoire?.nom ? ` · ${territoire.nom}` : ''}
          </p>

          {/* La recherche, en pastille blanche : « 40 espèces à découvrir ». */}
          <label className="mt-4 flex w-full items-center gap-2.5 rounded-full bg-white px-4"
            style={{ maxWidth: 420, boxShadow: '0 6px 18px rgba(0,0,0,.22)' }}>
            <IconeChampignon taille={20} epaisseur={1.8} />
            <input value={recherche} onChange={e => setRecherche(e.target.value)}
              placeholder={especes.length ? `${especes.length} espèces à découvrir` : 'Rechercher une espèce'}
              aria-label="Rechercher une espèce"
              className="min-w-0 flex-1 border-0 bg-transparent py-3 text-[14px] font-semibold outline-none"
              style={{ color: '#1E241F' }} />
            {recherche ? (
              <button type="button" onClick={() => setRecherche('')} aria-label="Effacer la recherche"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-none bg-transparent" style={{ color: '#59645B' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#59645B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            )}
          </label>
        </div>
      </header>

      {/* ─── Les quatre portes ─── */}
      <FiltresBois
        panneau={panneau} bascule={bascule} couleur={fCouleur} milieu={fMilieu}
        onPanneau={changerPanneau} onBascule={changerBascule}
        onCouleur={setFCouleur} onMilieu={setFMilieu} />

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

      {/* ─── Titre de section, filtres retenus, compteur ─── */}
      <div className="flex items-baseline justify-between gap-3 px-4 pb-1 pt-5">
        <h2 className="m-0 font-serif text-[18px] font-bold leading-none" style={{ letterSpacing: '-0.01em', color: 'var(--uni-ink)' }}>
          {actifs.length ? actifs.join(' · ') : 'Toutes les espèces'}
        </h2>
        <span className="shrink-0 text-[12px] font-semibold tabular-nums" style={{ color: 'var(--uni-dim)' }}>
          {liste.length} / {especes.length}
        </span>
      </div>
      {(actifs.length > 0 || recherche) && (
        <button type="button" onClick={toutEffacer}
          className="mx-4 border-none bg-transparent p-0 text-[12px] font-bold underline" style={{ color: 'var(--uni-accent)' }}>
          Tout effacer
        </button>
      )}

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
        <main className="grid px-4 pt-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 155px), 1fr))', gap: 12 }}>
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
                <span className="font-title text-[14px] leading-tight" style={{ fontWeight: 700 }}>{e.nom}</span>
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
