import { supabase } from '@/lib/supabase'

/**
 * Erreur enrichie remontée par les fetchers SWR.
 *  - status   : code HTTP renvoyé
 *  - info     : payload JSON éventuel (utile pour afficher un message clair)
 *
 * SWR cache cet objet en tant qu'error → composants peuvent le lire via le
 * tuple { data, error, isLoading } et adapter l'UI (toast, retry, etc.).
 */
export class FetchError extends Error {
  status: number
  info?: unknown
  constructor(message: string, status: number, info?: unknown) {
    super(message)
    this.status = status
    this.info = info
  }
}

/**
 * Fetcher SWR AUTHENTIFIÉ — attache le Bearer token de la session courante.
 *
 * Comportement 401 :
 *   1. Si on prend un 401, on appelle supabase.auth.refreshSession() UNE fois
 *      (en cas de token expiré juste à l'instant)
 *   2. Si le refresh réussit, on retry l'appel avec le nouveau token
 *   3. Si le refresh échoue OU si le retry retourne encore 401 → throw FetchError
 *      avec status=401. Les composants peuvent intercepter (ex: ouvrir modal login).
 *
 * Sécurité : on ne tente PAS plus d'un refresh + retry (pas de boucle infinie
 * sur un token définitivement HS).
 *
 * Utilisation :
 *   const { data, error } = useSWR(key, authedFetcher)
 *
 * Note : ce fetcher VIENT EN COMPLÉMENT du defaultFetcher (public) qui reste
 * la valeur par défaut du SWRProvider global. Il faut le passer explicitement
 * aux useSWR qui en ont besoin (data PERSO derrière requireUser).
 */
export async function authedFetcher<T = unknown>(url: string): Promise<T> {
  const session1 = (await supabase.auth.getSession()).data.session
  const token1 = session1?.access_token

  // Pas de token → on échoue tôt avec une erreur explicite. SWR caching l'error
  // et le composant peut afficher "Connecte-toi" / openAuthModal().
  if (!token1) {
    throw new FetchError('Session absente', 401)
  }

  const res1 = await fetch(url, {
    headers: { Authorization: `Bearer ${token1}` },
  })

  if (res1.status !== 401) {
    // Succès ou autre erreur (4xx/5xx hors 401) → on remonte tel quel.
    if (!res1.ok) {
      const info = await res1.json().catch(() => undefined)
      throw new FetchError(`Fetch failed: ${res1.status}`, res1.status, info)
    }
    return res1.json() as Promise<T>
  }

  // ── 401 → tentative de refresh + retry UNE seule fois ──
  const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession()
  if (refreshErr || !refreshed.session?.access_token) {
    // Refresh impossible → session définitivement morte
    throw new FetchError('Session expirée', 401, refreshErr?.message)
  }

  const token2 = refreshed.session.access_token
  const res2 = await fetch(url, {
    headers: { Authorization: `Bearer ${token2}` },
  })

  if (!res2.ok) {
    const info = await res2.json().catch(() => undefined)
    throw new FetchError(`Fetch failed after refresh: ${res2.status}`, res2.status, info)
  }
  return res2.json() as Promise<T>
}
