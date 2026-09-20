/**
 * QUELLES CLÉS DE RÉGLAGE APPARTIENNENT À UN TERRITOIRE.
 *
 * Donnée pure, sans dépendance : le serveur ET le navigateur la lisent, et
 * c'est indispensable qu'ils répondent la même chose. Deux listes qui
 * divergent, et l'admin enregistrerait un héros là où l'app en lit un autre.
 *
 * ────────────────────────────────────────────────────────────────────────
 * Quand un territoire n'a pas de valeur pour une clé, il y a DEUX bonnes
 * réponses, et les confondre produit des bugs opposés :
 *
 *   ÉDITORIAL — le héros, le splash, le carrousel, le sous-titre, la lettre.
 *   Des choses ÉCRITES pour un endroit. Hériter afficherait le journal des
 *   Cévennes aux habitants de Pau : un mensonge visible. → `null`.
 *
 *   TECHNIQUE — la maintenance, le style de carte, le modèle de l'assistant,
 *   ses quotas. Des réglages de l'outil, pas du lieu. Se taire les casserait :
 *   un territoire sans modèle d'assistant n'aurait plus d'assistant. → hérite.
 * ────────────────────────────────────────────────────────────────────────
 *
 * L'INTERFACE NE SE DUPLIQUE PAS. Décision du 20/09/2026 : ce qui décide de
 * la FORME est global, seul le CONTENU est local. `entree_app` (l'écran
 * d'entrée s'ouvre-t-il, sur quelle page on atterrit) et
 * `hub_hero_intro_enabled` sont donc techniques : on les règle une fois, ils
 * valent partout. Une ville ne doit pas s'ouvrir autrement qu'une autre.
 *
 * DEUX EXCEPTIONS QUI N'EN SONT PAS. `radio_village_public` et
 * `cinema_village_public` restent locales : elles ne règlent pas une
 * interface, elles répondent à « cette vallée a-t-elle une radio ? ». Pau n'a
 * pas de cinéma ; hériter d'un « visible » y afficherait un module vide.
 *
 * `splash_promo` reste locale aussi, pour une raison moins visible : elle ne
 * porte pas que des réglages, elle porte l'ÉTAT de la campagne — `activatedAt`
 * marque la frontière entre vétérans et nouveaux venus. Héritée, un territoire
 * qui ouvre prendrait ses tout premiers habitants pour des anciens.
 */
export const CLES_EDITORIALES = new Set([
  'village_hero',
  'hub_subtitle',
  'hub_hero_intro_image_url',
  'splash_hero_image_url',
  'splash_decouvrir',
  'splash_promo',
  'promo_carousel',
  'image_library',
  'newsletter_current',
  'newsletter_draft',
  'newsletter_auto_last',
  'radio_topbar_logo',
  'radio_village_public',
  'cinema_village_public',
  'carte_depart_lat',
  'carte_depart_lng',
  'carte_depart_zoom',
])

/** Vrai si la clé se tait plutôt que d'hériter. */
export function estEditoriale(cle: string): boolean {
  return CLES_EDITORIALES.has(cle)
}
