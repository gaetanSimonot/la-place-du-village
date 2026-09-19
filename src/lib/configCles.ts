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
 */
export const CLES_EDITORIALES = new Set([
  'village_hero',
  'hub_subtitle',
  'hub_section_order',
  'hub_section_hidden',
  'hub_hero_intro_enabled',
  'hub_hero_intro_image_url',
  'splash_hero_image_url',
  'splash_decouvrir',
  'splash_promo',
  'promo_carousel',
  'image_library',
  'entree_app',
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
