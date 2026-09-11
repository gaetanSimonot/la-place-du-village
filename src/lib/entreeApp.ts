/**
 * L'ENTRÉE DE L'APP — ce qu'on voit en arrivant.
 *
 * Deux réglages qui vont ensemble, et une seule clé de config
 * (`entree_app`) pour les porter : l'écran d'accueil éditorial s'affiche-t-il,
 * et sur quelle page atterrit-on. Les séparer en deux clés ferait deux
 * requêtes et deux endroits à regarder pour répondre à une seule question.
 *
 * À NE PAS CONFONDRE avec `splash_promo` : celui-là règle les interstitiels de
 * l'offre Habitant, qui surgissent en cours de visite. Celui-ci règle l'écran
 * d'entrée aux tuiles (« Explorer la Place »).
 */

/** Les pages sur lesquelles l'app peut ouvrir. */
export type PageArrivee = 'carte' | 'village' | 'promotions' | 'annonces'

export interface EntreeApp {
  /** L'écran d'accueil éditorial s'ouvre-t-il à chaque lancement ? */
  splash: boolean
  page: PageArrivee
}

/**
 * Le comportement d'avant le réglage : l'écran d'accueil s'ouvre, et on
 * atterrit sur la carte. Ne rien régler ne change donc rien.
 */
export const ENTREE_DEFAUT: EntreeApp = { splash: true, page: 'carte' }

const PAGES: PageArrivee[] = ['carte', 'village', 'promotions', 'annonces']

/** Libellés de l'écran d'administration — et d'eux seuls. */
export const PAGES_ARRIVEE: { id: PageArrivee; label: string; sous: string }[] = [
  { id: 'carte',      label: 'La carte',   sous: 'les événements autour de soi' },
  { id: 'village',    label: 'Le village', sous: 'le fil, les rubriques, l’agenda' },
  { id: 'promotions', label: 'Bons plans', sous: 'les promotions en cours' },
  { id: 'annonces',   label: 'Annonces',   sous: 'les petites annonces' },
]

/**
 * Tolérant par construction : la valeur vient d'une colonne texte, et une
 * config illisible ne doit jamais empêcher l'app de s'ouvrir. Au moindre
 * doute, on retombe sur le comportement d'avant.
 */
export function parseEntree(v: string | null | undefined): EntreeApp {
  if (!v) return ENTREE_DEFAUT
  try {
    const o = JSON.parse(v) as Partial<EntreeApp>
    return {
      splash: typeof o.splash === 'boolean' ? o.splash : ENTREE_DEFAUT.splash,
      page:   PAGES.includes(o.page as PageArrivee) ? (o.page as PageArrivee) : ENTREE_DEFAUT.page,
    }
  } catch {
    return ENTREE_DEFAUT
  }
}

/** Là où le client garde la dernière valeur connue. */
export const CLE_CACHE_ENTREE = 'pdv-entree-app'

/**
 * Le réglage, tout de suite et sans attendre le réseau.
 *
 * L'écran d'entrée se décide au premier rendu : aller le demander au serveur
 * d'abord, ce serait l'ouvrir puis le refermer sous les yeux de la personne,
 * ou retarder l'ouverture de l'app pour un réglage qui change deux fois par
 * an. On lit donc la dernière valeur connue, et on rafraîchit derrière pour
 * la prochaine ouverture — un changement en admin s'applique au lancement
 * suivant, ce qui est le rythme d'un réglage d'entrée.
 */
export function lireEntreeEnCache(): EntreeApp {
  if (typeof window === 'undefined') return ENTREE_DEFAUT
  try {
    return parseEntree(localStorage.getItem(CLE_CACHE_ENTREE))
  } catch {
    return ENTREE_DEFAUT
  }
}

/** Met le cache à jour depuis le serveur, sans bloquer qui que ce soit. */
export async function rafraichirEntreeEnCache(): Promise<void> {
  try {
    const r = await fetch('/api/entree', { cache: 'no-store' })
    if (!r.ok) return
    const j = await r.json()
    localStorage.setItem(CLE_CACHE_ENTREE, JSON.stringify(parseEntree(JSON.stringify(j))))
  } catch { /* pas de réglage frais, pas de bruit : le cache fait l'affaire */ }
}
