import { track } from '@vercel/analytics'

/**
 * Événements personnalisés, envoyés à Vercel Web Analytics — déjà monté dans
 * layout.tsx via <Analytics />. On ne branche pas d'outil supplémentaire.
 *
 * ⚠️ Deux limites de Vercel Web Analytics à connaître :
 *  - les *custom events* ne sont PAS collectés sur le plan Hobby. `track()`
 *    ne lève pas d'erreur, l'événement est simplement perdu. Les appels sont
 *    en place et prêts, mais rien n'apparaîtra dans le tableau de bord tant
 *    que le projet n'est pas en Pro.
 *  - sur Pro, un événement n'accepte que **2 propriétés** (8 avec l'add-on
 *    Web Analytics Plus). D'où les payloads volontairement réduits à deux
 *    clés : au-delà, les propriétés supplémentaires sont perdues.
 *
 * Les événements existants (ouverture de la modale d'abonnement, checkout,
 * abonnement réussi) ne passent PAS par ici et ne sont pas touchés.
 */
export type AnalyticsProps = Record<string, string | number | boolean | null>

export function trackEvent(name: string, props?: AnalyticsProps): void {
  // Jamais bloquant : une erreur d'analytics ne doit pas casser un parcours.
  try { track(name, props) } catch { /* noop */ }
}
