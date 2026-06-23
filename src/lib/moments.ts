/**
 * « En ce moment » — types partagés client/serveur pour les moments éphémères.
 */

export type MomentKind = 'video' | 'photo'

/** Cible liée à un moment (lieu ou événement) → bouton "Voir la fiche". */
export interface MomentCible {
  type: 'evenement' | 'etablissement' | 'lieu'
  id: string
  nom: string
}

export interface Moment {
  id: string
  auteur_id: string
  auteur_nom: string
  auteur_avatar: string | null
  media_kind: MomentKind
  media_url: string
  poster_url: string | null
  duree_sec: number | null
  legende: string | null
  created_at: string
  /** Le reel est-il actuellement poussé sur le fil d'accueil du village. */
  sur_accueil: boolean
  cible: MomentCible | null
  likes: number
  comments: number
  /** Le moment a-t-il été vu par l'utilisateur courant (false si non connecté). */
  vu: boolean
  /** L'utilisateur courant a-t-il liké (false si non connecté). */
  liked: boolean
}

export interface MomentCommentaire {
  id: string
  auteur_nom: string | null
  texte: string
  created_at: string
}

/** Durée max d'une vidéo de moment (secondes). */
export const MOMENT_VIDEO_MAX_SEC = 60

/** Temps écoulé court : « 2h », « 30min », « à l'instant ». */
export function momentAge(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "à l'instant"
  if (mins < 60) return `${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}j`
}
