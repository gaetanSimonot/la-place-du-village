/**
 * MINIATURES D'AFFICHES — la règle de nommage, partagée client et serveur.
 *
 * Une affiche envoyée pèse souvent 100 à 300 ko pour une vignette de 86 px :
 * au 13/10/2026, 16 vignettes faisaient 880 ko d'un premier chargement de
 * 2,3 Mo en 4G, et retardaient la carte. Chaque affiche du bucket
 * `event-images` a donc une miniature webp de 480 px (≈ 20 ko), rangée au
 * même chemin sous `vignettes/` :
 *
 *   inbox/abc.jpg  →  vignettes/inbox/abc.webp
 *
 * Aucune colonne en base : le chemin se déduit de l'URL. Les miniatures sont
 * fabriquées par /api/cron/vignettes (lib/vignettesServeur.ts) ; tant qu'une
 * miniature n'existe pas, <ImageVignette> retombe sur l'original.
 */

export const BUCKET_AFFICHES = 'event-images'
export const DOSSIER_VIGNETTES = 'vignettes/'
const MARQUE = `/storage/v1/object/public/${BUCKET_AFFICHES}/`

/** Chemin dans le bucket d'une affiche à nous ; null pour tout le reste. */
export function cheminAffiche(url: string | null | undefined): string | null {
  if (!url) return null
  const i = url.indexOf(MARQUE)
  if (i < 0) return null
  const chemin = decodeURIComponent(url.slice(i + MARQUE.length).split(/[?#]/)[0])
  if (!chemin || chemin.startsWith(DOSSIER_VIGNETTES)) return null
  return chemin
}

/** Chemin de la miniature d'une affiche (dans le même bucket). */
export function cheminVignette(chemin: string): string {
  return DOSSIER_VIGNETTES + chemin.replace(/\.[a-z0-9]+$/i, '') + '.webp'
}

/** URL de la miniature d'une affiche à nous ; null si l'image vient d'ailleurs. */
export function vignetteDe(url: string | null | undefined): string | null {
  const chemin = cheminAffiche(url)
  if (!chemin || !url) return null
  const base = url.slice(0, url.indexOf(MARQUE) + MARQUE.length)
  return base + cheminVignette(chemin).split('/').map(encodeURIComponent).join('/')
}
