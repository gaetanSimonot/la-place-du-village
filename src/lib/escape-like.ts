/**
 * Échappe les caractères spéciaux LIKE/ILIKE de Postgres pour qu'une chaîne
 * soit comparée littéralement, sans sémantique wildcard.
 *
 * Caractères spéciaux :
 *   _   → wildcard 1 char  (ex: a_c matche abc, axc, etc.)
 *   %   → wildcard N chars (ex: a%c matche ac, abbbc, etc.)
 *   \   → caractère d'escape lui-même
 *
 * Usage :
 *   const safe = escapeLikePattern(email.toLowerCase())
 *   supabase.from('admin_emails').ilike('email', safe)
 *
 * Ainsi `ilike` se comporte comme `lower(email) = lower(input)` strict —
 * impossible de matcher l'email d'un autre utilisateur via un underscore
 * placé à un endroit stratégique (faille LIKE-injection).
 */
export function escapeLikePattern(s: string): string {
  return s.replace(/[\\%_]/g, '\\$&')
}
