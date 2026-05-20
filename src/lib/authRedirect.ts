/**
 * AUTH REDIRECT — helpers pour le post-login redirect
 *
 * On veut ramener l user sur la page d origine apres login. 2 contraintes :
 *
 * 1. Securite : un `next` venant d une query URL peut etre forge par un
 *    attaquant. On doit sanitize pour eviter les open redirects (vers un
 *    site externe), les protocoles dangereux (javascript:, data:), et les
 *    boucles infinies vers /auth/.
 *
 * 2. Robustesse cross-context : sur iOS PWA standalone, OAuth Google s ouvre
 *    dans Safari (browser separe). Le sessionStorage de la PWA n est pas
 *    accessible cote Safari. Donc on encode `next` dans l URL `redirectTo`
 *    plutot que sessionStorage : ca survit au changement de browser.
 */

/**
 * Valide qu un `next` est un chemin relatif safe. Retourne '/' si invalide.
 *
 * Refuse :
 * - URLs absolues (https://..., mailto:...)
 * - Protocol-relative (//evil.com)
 * - Protocoles dangereux (javascript:, data:, vbscript:)
 * - Chemins qui boucleraient vers /auth/ (callback)
 * - Tout ce qui n est pas une string commencant par /
 */
export function sanitizeNext(input: string | null | undefined): string {
  if (!input || typeof input !== 'string') return '/'
  const trimmed = input.trim()
  if (!trimmed) return '/'
  // Doit commencer par exactement un slash
  if (!trimmed.startsWith('/')) return '/'
  // Pas de protocol-relative URL (//evil.com)
  if (trimmed.startsWith('//')) return '/'
  // Pas de boucle vers les routes auth elles-memes
  if (trimmed.startsWith('/auth/')) return '/'
  // Garde-fou supplementaire contre les protocoles inline (theoriquement
  // impossible avec le startsWith('/') ci-dessus mais belt-and-braces)
  const lower = trimmed.toLowerCase()
  if (lower.includes('javascript:') || lower.includes('data:') || lower.includes('vbscript:')) {
    return '/'
  }
  return trimmed
}

/**
 * Construit l URL `redirectTo` a passer a signInWithOAuth / signInWithOtp.
 * Inclut `next` en query encoded -> survit au changement de browser context.
 */
export function buildOAuthCallbackUrl(next: string): string {
  if (typeof window === 'undefined') return '/auth/callback'
  const safeNext = sanitizeNext(next)
  const params = new URLSearchParams()
  if (safeNext !== '/') params.set('next', safeNext)
  const qs = params.toString()
  return `${window.location.origin}/auth/callback${qs ? `?${qs}` : ''}`
}

/**
 * Recupere le chemin courant (pathname + search) si on est cote client,
 * pour pre-remplir le returnTo quand `openAuthModal()` est appele sans arg.
 * Retourne '/' si on est server-side ou si l URL n est pas sanitizable.
 */
export function getCurrentPathAsReturn(): string {
  if (typeof window === 'undefined') return '/'
  const path = window.location.pathname + window.location.search
  return sanitizeNext(path)
}
