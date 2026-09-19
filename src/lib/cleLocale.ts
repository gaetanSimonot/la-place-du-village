/**
 * LE NOM D'UN CACHE LOCAL PORTE CELUI DE SON TERRITOIRE.
 *
 * Cinq bugs distincts, une seule faute : un état gardé sous un nom unique
 * ressort dans l'autre ville et y ment. La caméra de la carte envoyait Pau à
 * huit cents kilomètres hors de l'écran ; la zone connue faisait disparaître
 * la section « Aujourd'hui » ; l'image d'entrée montrait les Cévennes à qui
 * regardait Pau.
 *
 * LE TERRITOIRE PAR DÉFAUT GARDE LA CLÉ HISTORIQUE. C'est ce qui rend la
 * règle applicable sans rien casser : un réglage déjà enregistré continue de
 * s'appliquer, et rien ne change pour les habitants.
 */
export function cleLocale(base: string, slug: string | null, parDefaut: boolean): string {
  return (!slug || parDefaut) ? base : `${base}:${slug}`
}
