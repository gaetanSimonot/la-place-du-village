/**
 * LE REGROUPEMENT DES PUNAISES EN BULLES (clustering), en crans.
 *
 * Réglage admin GLOBAL (réglages de la carte), clé config `carte_regroupement`.
 * Même échelle pour les deux fonds (Google, MapLibre), et pour les trois
 * couches (événements, commerces, producteurs). Les commerces et événements
 * mis en avant ne sont jamais regroupés, quel que soit le cran.
 *
 *   rayon   : distance à l'écran (px) sous laquelle deux punaises fusionnent
 *   zoomFin : au-delà de ce zoom, plus aucun regroupement
 *
 * « Aucun » garde l'algorithme (zoomFin 0 : il ne regroupe qu'au zoom 0) pour
 * ne pas ouvrir un second chemin de code. Attention : sans bulles, un téléphone
 * modeste dézoomé sur tout le territoire peut ramer (1 474 commerces).
 */

export type CranRegroupement = 'aucun' | 'leger' | 'normal' | 'fort'

export const CRANS_REGROUPEMENT: Record<CranRegroupement, { libelle: string; rayon: number; zoomFin: number }> = {
  aucun:  { libelle: 'Aucun',  rayon: 1,  zoomFin: 0 },
  leger:  { libelle: 'Léger',  rayon: 25, zoomFin: 12 },
  normal: { libelle: 'Normal', rayon: 40, zoomFin: 14 },
  fort:   { libelle: 'Fort',   rayon: 70, zoomFin: 16 },
}

export const CLE_CONFIG_REGROUPEMENT = 'carte_regroupement'

export function lireCran(v: string | null | undefined): CranRegroupement {
  return v === 'aucun' || v === 'leger' || v === 'fort' ? v : 'normal'
}
