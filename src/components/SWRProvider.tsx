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
      }}
    >
      {children}
    </SWRConfig>
  )
}
