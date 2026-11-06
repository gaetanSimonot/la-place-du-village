'use client'
import { SWRConfig } from 'swr'

/** Fetcher SWR par défaut — JSON fetch standard.
 *  Throw sur status non-ok pour que SWR ne cache pas une réponse erreur. */
export async function defaultFetcher(url: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
  return res.json()
}

/**
 * LA PAGE DU VILLAGE S'OUVRE TOUTE FAITE.
 *
 * Chaque bloc du Village (Aujourd'hui, cinéma, bois, théâtre, radio,
 * annonces) va chercher ses données de son côté : sans mémoire, la page se
 * construisait sous les yeux, bloc après bloc. On garde donc sur le téléphone
 * la dernière réponse de CES routes-là, et elle est servie dès la première
 * image ; SWR revalide derrière (revalidateIfStale) et seul le contenu change.
 *
 * Liste fermée : jamais le reste du cache (messages, profil, carte…), qui
 * n'a rien à faire en mémoire durable ni la place d'y tenir.
 */
const CLE_MEMOIRE = 'pdv-swr-village'
const A_GARDER = /\/api\/(hub|cinema\/affiche|champignons|theatre|radio|annonces)\b/
const AGE_MAX_MS = 7 * 24 * 3600 * 1000

/** Vrai quand rien n'a été retrouvé en mémoire : le Village attend alors ses blocs. */
export let memoireVillageVide = true

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fournisseurAvecMemoire(): Map<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const carte = new Map<string, any>()
  if (typeof window === 'undefined') return carte
  try {
    const lu = JSON.parse(localStorage.getItem(CLE_MEMOIRE) ?? 'null')
    if (lu && Date.now() - lu.a < AGE_MAX_MS) {
      for (const [k, data] of lu.e as [string, unknown][]) carte.set(k, { data })
    }
  } catch { /* mémoire illisible : on repart de zéro */ }
  memoireVillageVide = carte.size === 0

  const garder = () => {
    try {
      const e: [string, unknown][] = []
      carte.forEach((v, k) => { if (A_GARDER.test(k) && v?.data !== undefined) e.push([k, v.data]) })
      localStorage.setItem(CLE_MEMOIRE, JSON.stringify({ a: Date.now(), e }))
    } catch { /* stockage plein ou indisponible */ }
  }
  // L'appli quittée ou passée en arrière-plan : c'est là qu'on écrit.
  window.addEventListener('pagehide', garder)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') garder() })
  return carte
}

/**
 * Provider SWR global de l'app.
 *
 * Options par défaut héritées par tous les useSWR de l'app :
 *  - revalidateOnFocus: true  → revalidation au retour sur l'onglet/window
 *  - dedupingInterval: 5000   → 1 seul fetch si plusieurs composants demandent
 *                                la même clé en <5s
 *  - keepPreviousData: true   → pas de flash à vide pendant la revalidation
 *  - fetcher: defaultFetcher  → JSON fetch standard, throw sur erreur
 *
 * Un composant peut override localement via options du useSWR(key, fetcher, opts).
 */
export default function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher:            defaultFetcher,
        revalidateOnFocus:  true,
        dedupingInterval:   5000,
        keepPreviousData:   true,
        provider:           fournisseurAvecMemoire,
      }}
    >
      {children}
    </SWRConfig>
  )
}
