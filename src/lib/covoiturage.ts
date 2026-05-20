/**
 * COVOITURAGE — types partagés
 */

export type CovoitStatut = 'actif' | 'complet' | 'annule'
export type CovoitConvStatut = 'open' | 'validee' | 'refusee' | 'closed'
export type CovoitMsgKind = 'text' | 'system'

export interface Covoiturage {
  id: string
  user_id: string
  depart: string
  destination: string
  date_trajet: string         // YYYY-MM-DD
  heure_depart: string | null // "HH:MM" libre
  prix: number                // 0 = gratuit
  places: number
  places_prises: number
  point_recup: string | null
  fumeur: boolean
  animaux: boolean
  bagages: boolean
  description: string | null
  statut: CovoitStatut
  created_at: string
  updated_at: string
}

export interface CovoitConversation {
  id: string
  covoit_id: string
  candidat_id: string
  conducteur_id: string
  statut: CovoitConvStatut
  created_at: string
  updated_at: string
}

export interface CovoitMessage {
  id: string
  conversation_id: string
  sender_id: string | null
  kind: CovoitMsgKind
  content: string
  lu_at: string | null
  created_at: string
}

export interface CovoitFormInput {
  depart: string
  destination: string
  date_trajet: string
  heure_depart?: string | null
  prix: number
  places: number
  point_recup?: string | null
  fumeur: boolean
  animaux: boolean
  bagages: boolean
  description?: string | null
}

/**
 * Validation basique du formulaire avant POST.
 * Retourne un message d'erreur ou null si OK.
 */
export function validateCovoitInput(input: CovoitFormInput): string | null {
  if (!input.depart?.trim())      return 'Le départ est requis'
  if (!input.destination?.trim()) return 'La destination est requise'
  if (!input.date_trajet)         return 'La date est requise'
  if (input.places < 1 || input.places > 8) return 'Places entre 1 et 8'
  if (input.prix < 0 || input.prix > 999)   return 'Prix entre 0 et 999 €'
  // Date pas dans le passé (tolérance jour J)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(input.date_trajet); d.setHours(0, 0, 0, 0)
  if (d.getTime() < today.getTime()) return 'La date ne peut pas être dans le passé'
  return null
}
