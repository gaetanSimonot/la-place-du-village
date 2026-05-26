import { jsonrepair } from 'jsonrepair'

/**
 * Parse une réponse JSON Claude avec fallback jsonrepair pour les sorties
 * imparfaites (apostrophes typographiques, guillemets oubliés sur clés,
 * truncation, virgules manquantes/en trop, etc.).
 *
 * Étapes :
 *   1. Strip d'éventuels fences markdown ```json ... ```
 *   2. JSON.parse standard (chemin rapide pour les sorties propres)
 *   3. Si fail → jsonrepair() puis JSON.parse (récupération des sorties cassées)
 *   4. Si fail encore → null (l'appelant choisit quoi faire : log + abandon)
 *
 * Utilisé partout où on parse une réponse Claude (extract, dédup, scrape, voice).
 */
export function safeJsonParse<T = unknown>(raw: string): T | null {
  const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  if (!clean) return null

  try {
    return JSON.parse(clean) as T
  } catch {
    try {
      return JSON.parse(jsonrepair(clean)) as T
    } catch {
      return null
    }
  }
}
