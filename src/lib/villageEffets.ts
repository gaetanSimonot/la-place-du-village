/**
 * LES EFFETS DE PROFONDEUR DU VILLAGE — des essais, réglés dans
 * /admin/hub-carousel, clé `village_effets`.
 *
 *  - `courbe`   : les blocs se penchent en 3D selon leur hauteur à l'écran,
 *    comme vus de l'intérieur d'un tambour (useEffetTambour). Les images des
 *    publications sont découpées en tranches pour se TORDRE au lieu de pivoter.
 *  - `flou`     : un flou progressif en haut et en bas (FlouBords), avec sa
 *    hauteur, sa force et son arrondi.
 *  - `vignette` : un assombrissement (ou éclaircissement) des bords de l'écran.
 *  - `voile`    : le dégradé du bas de page, au-dessus de la barre d'onglets.
 *
 * Réglage d'INTERFACE, donc technique (cf. configCles.ts) : on le règle une
 * fois, il vaut pour tous les territoires. Tant qu'on n'a rien réglé, les
 * effets sont allumés — on les teste allumés.
 */
export type CouleurVignette = 'aucune' | 'blanc' | 'noir'
export type CouleurVoile = 'aucun' | 'creme' | 'blanc' | 'noir'

export interface VillageEffets {
  courbe: boolean
  /** Force de la courbe, de −100 à 100 : 0 à plat ; positif concave (dans le
   *  tambour), négatif convexe (sur le rouleau). ±50 = rayon de 0,9 × l'écran.
   *  Au tambour pressé : positif creuse le centre, négatif le bombe. */
  courbeForce: number
  /** ESSAI « tambour pressé » : pendant que le doigt fait défiler, le centre
   *  de l'écran s'enfonce (haut et bas immobiles) ; retour à plat au lâcher.
   *  Remplace la courbe fixe. Le nom de la clé date d'un premier essai. */
  enfoncement: boolean
  /** Tambour pressé : temps pour que le creux se forme sous le doigt, en ms
   *  (à 95 %, ressort sans rebond). */
  pressionMs: number
  /** Tambour pressé : temps pour revenir à plat au lâcher, en ms. */
  relacheMs: number
  flou: boolean
  /** Hauteur des bandes de flou, en px. */
  flouTaille: number
  /** Flou maximal, au ras du bord, en px. */
  flouForce: number
  /** 0 = bande droite, 100 = bord en ovale (plus de flou dans les coins). */
  flouRond: number
  vignette: CouleurVignette
  /** 0 à 100. */
  vignetteForce: number
  /** Part de l'écran gagnée par la vignette, depuis les bords : 10 à 90. */
  vignetteTaille: number
  voile: CouleurVoile
}

/**
 * Les réglages retenus par Gaëtan le 29/09/2026 : c'est le point de départ.
 * L'app démarre avec eux AVANT d'avoir lu la base — sinon, au lancement, la
 * vignette, la courbe et le flou changeaient sous les yeux en arrivant.
 * Un réglage changé depuis passe par le cache (lireEffetsEnCache).
 */
export const EFFETS_DEFAUT: VillageEffets = {
  courbe: true,
  courbeForce: -3,
  enfoncement: true,
  pressionMs: 200,
  relacheMs: 380,
  flou: true,
  flouTaille: 62,
  flouForce: 2,
  flouRond: 50,
  vignette: 'blanc',
  vignetteForce: 47,
  vignetteTaille: 24,
  voile: 'blanc',
}

/** Là où le téléphone garde les derniers réglages lus. */
export const CLE_CACHE_EFFETS = 'pdv-village-effets'

/**
 * Les derniers réglages connus de CE téléphone, tout de suite, sans réseau.
 * Le Village s'ouvre avec eux ; la base, relue derrière, ne corrige que ce
 * qui a changé depuis. Sans cache (premier lancement) : EFFETS_DEFAUT.
 */
export function lireEffetsEnCache(): VillageEffets {
  if (typeof window === 'undefined') return EFFETS_DEFAUT
  try {
    const v = localStorage.getItem(CLE_CACHE_EFFETS)
    return v ? parseEffets(v) : EFFETS_DEFAUT
  } catch {
    return EFFETS_DEFAUT
  }
}

export function garderEffetsEnCache(e: VillageEffets): void {
  try { localStorage.setItem(CLE_CACHE_EFFETS, JSON.stringify(e)) } catch { /* stockage indisponible */ }
}

/** Bornes des curseurs de l'admin — et de la relecture, qui les respecte. */
export const BORNES_EFFETS = {
  courbeForce:   { min: -100, max: 100 }, // 0 = à plat ; > 0 concave ; < 0 convexe
  pressionMs:    { min: 60, max: 1000 },
  relacheMs:     { min: 60, max: 1500 },
  flouTaille:    { min: 40, max: 240 },
  flouForce:     { min: 2,  max: 24 },
  flouRond:      { min: 0,  max: 100 },
  vignetteForce: { min: 0,  max: 100 },
  vignetteTaille: { min: 10, max: 90 },
} as const

const nombre = (v: unknown, cle: keyof typeof BORNES_EFFETS): number => {
  const { min, max } = BORNES_EFFETS[cle]
  const n = typeof v === 'number' && Number.isFinite(v) ? v : EFFETS_DEFAUT[cle]
  return Math.min(max, Math.max(min, Math.round(n)))
}

export function parseEffets(v: string | null | undefined): VillageEffets {
  if (!v) return EFFETS_DEFAUT
  try {
    const o = JSON.parse(v) as Record<string, unknown>
    return {
      courbe: typeof o.courbe === 'boolean' ? o.courbe : EFFETS_DEFAUT.courbe,
      courbeForce: nombre(o.courbeForce, 'courbeForce'),
      enfoncement: o.enfoncement === true,
      pressionMs: nombre(o.pressionMs, 'pressionMs'),
      relacheMs:  nombre(o.relacheMs, 'relacheMs'),
      flou:  typeof o.flou === 'boolean' ? o.flou : EFFETS_DEFAUT.flou,
      flouTaille: nombre(o.flouTaille, 'flouTaille'),
      flouForce:  nombre(o.flouForce, 'flouForce'),
      flouRond:   nombre(o.flouRond, 'flouRond'),
      vignette: o.vignette === 'blanc' || o.vignette === 'noir' ? o.vignette : 'aucune',
      vignetteForce: nombre(o.vignetteForce, 'vignetteForce'),
      vignetteTaille: nombre(o.vignetteTaille, 'vignetteTaille'),
      voile: o.voile === 'aucun' || o.voile === 'blanc' || o.voile === 'noir' ? o.voile : 'creme',
    }
  } catch {
    return EFFETS_DEFAUT
  }
}
