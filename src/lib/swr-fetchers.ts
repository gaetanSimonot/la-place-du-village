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
 * Helper authedFetch — wrapper fetch() pour ÉCRITURES authentifiées.
 *
 * À utiliser pour POST/PATCH/DELETE/PUT vers les routes API qui font
 * requireUser/requireAdmin. Diffère de authedFetcher (lecture SWR) par :
 *   - retourne la Response brute (pas le JSON) → le caller peut checker
 *     res.ok avant d'updater son UI optimistic
 *   - accepte un init (method, body, headers extra)
 *
 * Comportement 401 :
 *   1. Récupère token via getSession() ; si absent → refreshSession()
 *      une fois, puis retry une fois.
 *   2. Si l'appel retourne 401, refresh + retry (1 fois max).
 *   3. Si toujours 401 → renvoie la Response 401 telle quelle. Le
 *      caller peut décider quoi faire (toast, openAuthModal…).
 *
 * Garanties :
 *   - Pas de boucle infinie : 1 refresh + 1 retry MAX.
 *   - Headers Authorization ajouté sans écraser ceux passés.
 *
 * Usage :
 *   const res = await authedFetch('/api/admin/evenements/123', {
 *     method: 'DELETE',
 *   })
 *   if (!res.ok) { toast.error('Erreur'); return }
 *   setEvenements(prev => prev.filter(...))
 */
export async function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  // Récupère le token avec fallback refresh
  let token = (await supabase.auth.getSession()).data.session?.access_token ?? null
  if (!token) {
    const refreshed = await supabase.auth.refreshSession()
    token = refreshed.data.session?.access_token ?? null
  }
  if (!token) {
    // Pas de session du tout — on renvoie une Response 401 synthétique
    // pour que le caller ait le même contrat (toujours une Response).
    return new Response(JSON.stringify({ error: 'Non authentifié' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const headers = new Headers(init.headers as HeadersInit | undefined)
  headers.set('Authorization', `Bearer ${token}`)

  const res1 = await fetch(url, { ...init, headers })
  if (res1.status !== 401) return res1

  // 401 → tentative refresh + retry une fois
  const refreshed = await supabase.auth.refreshSession()
  const token2 = refreshed.data.session?.access_token ?? null
  if (!token2) return res1  // refresh impossible → renvoie le 401 d'origine

  const headers2 = new Headers(init.headers as HeadersInit | undefined)
  headers2.set('Authorization', `Bearer ${token2}`)
  return fetch(url, { ...init, headers: headers2 })
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
