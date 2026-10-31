/**
 * LE THÈME SAISONNIER — un décor posé sur toute l'app (Halloween…), réglé
 * dans /admin/hub-carousel, clé `theme_saisonnier`.
 *
 * Réglage d'INTERFACE, donc technique (cf. configCles.ts) : un seul thème
 * pour tous les territoires.
 *
 * Tant que la clé n'a jamais été écrite, c'est THEME_DEFAUT qui vaut :
 * Halloween, allumé d'office le 31/10/2026 à la demande de Gaëtan. Une fois
 * éteint dans l'admin, la clé vaut 'aucun' et le défaut ne joue plus.
 */
export type ThemeSaisonnier = 'aucun' | 'halloween'

export const THEMES_SAISONNIERS: { id: ThemeSaisonnier; label: string }[] = [
  { id: 'aucun',     label: 'Aucun' },
  { id: 'halloween', label: 'Halloween' },
]

export const CLE_THEME = 'theme_saisonnier'
export const THEME_DEFAUT: ThemeSaisonnier = 'halloween'

/** Le bandeau posé au-dessus de la barre du bas, par thème. */
export const BANDEAU_THEME: Partial<Record<ThemeSaisonnier, string>> = {
  halloween: '/visuels/halloween-bandeau.webp',
}

/** Le décor fixe derrière la page Village (à la place du fond crème), par thème. */
export const FOND_VILLAGE_THEME: Partial<Record<ThemeSaisonnier, string>> = {
  halloween: '/visuels/halloween-fond-village.webp',
}

/** L'icône qui remplace le rond vert du « + » de la barre du bas, par thème. */
export const ICONE_PLUS_THEME: Partial<Record<ThemeSaisonnier, string>> = {
  halloween: '/visuels/halloween-plus.webp',
}

export function parseTheme(v: string | null | undefined): ThemeSaisonnier {
  return v === 'aucun' || v === 'halloween' ? v : THEME_DEFAUT
}

/** Là où le téléphone garde le dernier thème lu. */
const CLE_CACHE_THEME = 'pdv-theme-saisonnier'

/** Le dernier thème connu de CE téléphone, sans réseau (THEME_DEFAUT sinon). */
export function lireThemeEnCache(): ThemeSaisonnier {
  if (typeof window === 'undefined') return THEME_DEFAUT
  try {
    return parseTheme(localStorage.getItem(CLE_CACHE_THEME))
  } catch {
    return THEME_DEFAUT
  }
}

export function garderThemeEnCache(t: ThemeSaisonnier): void {
  try { localStorage.setItem(CLE_CACHE_THEME, t) } catch { /* stockage indisponible */ }
}
