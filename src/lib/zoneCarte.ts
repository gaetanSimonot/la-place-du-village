/**
 * LA LISTE SUIT LA CARTE — la zone vraiment visible, et ce qui s'y trouve.
 *
 * Option admin (réglages de la carte), modes Événements et Commerces : la
 * liste du bas ne garde que ce dont la punaise est dans la partie VISIBLE de
 * la carte — pas tout le rectangle : la barre du haut et la feuille en
 * recouvrent une bonne part. Calculée quand la carte s'arrête (idle), jamais
 * pendant le geste.
 *
 * Seule la LISTE se réduit. Les punaises et le cadrage automatique restent
 * nourris de la liste complète : si la carte suivait la liste qui suit la
 * carte, chaque zoom en relancerait un autre.
 */

export interface ZoneCarte { n: number; s: number; e: number; o: number }

/**
 * Retire de la zone affichée ce que masquent la barre du haut et la feuille.
 * Interpolation linéaire en latitude : l'erreur de la projection Mercator est
 * négligeable à l'échelle d'un territoire.
 */
export function zoneVisible(z: ZoneCarte, hauteur: number, haut: number, bas: number): ZoneCarte {
  if (!hauteur) return z
  const parPixel = (z.n - z.s) / hauteur
  const n = z.n - Math.max(0, haut) * parPixel
  const s = z.s + Math.max(0, bas) * parPixel
  return s < n ? { ...z, n, s } : z
}

export function dansZone(lat: number | null | undefined, lng: number | null | undefined, z: ZoneCarte): boolean {
  if (lat == null || lng == null) return false
  // e < o : la zone traverse l'antiméridien (sans objet ici, mais correct).
  const dansLng = z.e >= z.o ? lng >= z.o && lng <= z.e : lng >= z.o || lng <= z.e
  return lat <= z.n && lat >= z.s && dansLng
}

/** Le réglage : 'off', 'moi' (cet appareil, admin) ou 'tous' (config globale). */
export type ModeListeSuit = 'off' | 'moi' | 'tous'
export const CLE_CONFIG_LISTE_SUIT = 'carte_liste_suit'
export const CLE_LOCAL_LISTE_SUIT = 'pdv-liste-suit-moi'
