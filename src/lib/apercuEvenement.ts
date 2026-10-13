import type { Evenement, EvenementCard } from '@/lib/types'

/**
 * APERÇU DE FICHE — ce que la liste sait déjà d'un événement.
 *
 * Mesuré le 13/10/2026 en 4G : la fiche affichait un rond de chargement
 * 0,6 à 1,2 s, le temps de redemander au serveur un titre, une affiche, une
 * date et un lieu que la liste venait d'afficher. Celui qui ouvre la fiche
 * les laisse ici ; la fiche les montre tout de suite et complète avec la
 * vraie ligne dès qu'elle arrive.
 *
 * sessionStorage plutôt qu'un état React : la fiche est une autre route, et
 * l'aperçu doit survivre au changement de page. Un seul aperçu à la fois,
 * vérifié par son id : une fiche ouverte autrement (lien partagé, notif)
 * repart du chargement normal.
 */
const CLE = 'pdv-apercu-evt'

type Apercu = Pick<EvenementCard, 'id' | 'titre' | 'categorie' | 'categories' | 'date_debut' | 'date_fin' | 'heure'
  | 'image_url' | 'image_position' | 'lieux' | 'vote_count' | 'radio_selection'>

export function retenirApercu(evt: Partial<Apercu> & { id: string; titre: string }): void {
  try {
    const a = {
      id: evt.id, titre: evt.titre, categorie: evt.categorie, categories: evt.categories,
      date_debut: evt.date_debut ?? null, date_fin: evt.date_fin ?? null, heure: evt.heure ?? null,
      image_url: evt.image_url ?? null, image_position: evt.image_position ?? null,
      lieux: evt.lieux ?? null, vote_count: evt.vote_count ?? 0, radio_selection: !!evt.radio_selection,
    }
    sessionStorage.setItem(CLE, JSON.stringify(a))
  } catch { /* stockage indisponible : la fiche se chargera normalement */ }
}

/** L'aperçu laissé pour CET événement, ou null. */
export function lireApercu(id: string): Evenement | null {
  try {
    const brut = sessionStorage.getItem(CLE)
    if (!brut) return null
    const a = JSON.parse(brut) as Apercu
    if (!a || a.id !== id || typeof a.titre !== 'string') return null
    // Partiel par nature : la fiche n'en lit que des champs facultatifs
    // jusqu'à l'arrivée de la vraie ligne (cf. `complet` dans la fiche).
    return a as unknown as Evenement
  } catch { return null }
}
