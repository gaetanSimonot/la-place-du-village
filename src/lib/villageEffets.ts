/**
 * LES EFFETS DE PROFONDEUR DU VILLAGE — deux essais, réglés dans
 * /admin/hub-carousel, clé `village_effets`.
 *
 *  - `courbe` : les blocs se penchent en 3D selon leur hauteur à l'écran,
 *    comme vus de l'intérieur d'un tambour (useEffetTambour).
 *  - `flou`   : un flou progressif en haut et en bas de l'écran, façon
 *    « mise au point macro » (FlouBords).
 *
 * Réglage d'INTERFACE, donc technique (cf. configCles.ts) : on le règle une
 * fois, il vaut pour tous les territoires. Activés tant qu'on n'a rien réglé —
 * c'est la demande : on les teste allumés.
 */
export interface VillageEffets {
  courbe: boolean
  flou: boolean
}

export const EFFETS_DEFAUT: VillageEffets = { courbe: true, flou: true }

export function parseEffets(v: string | null | undefined): VillageEffets {
  if (!v) return EFFETS_DEFAUT
  try {
    const o = JSON.parse(v) as Partial<VillageEffets>
    return {
      courbe: typeof o.courbe === 'boolean' ? o.courbe : EFFETS_DEFAUT.courbe,
      flou:   typeof o.flou === 'boolean' ? o.flou : EFFETS_DEFAUT.flou,
    }
  } catch {
    return EFFETS_DEFAUT
  }
}
