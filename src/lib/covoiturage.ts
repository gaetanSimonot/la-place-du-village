/**
 * COVOITURAGE — types partagés
 */

export type CovoitStatut = 'actif' | 'complet' | 'annule'
export type CovoitConvStatut = 'open' | 'validee' | 'refusee' | 'closed'
export type CovoitMsgKind = 'text' | 'system'
export type CovoitSens = 'aller' | 'retour' | 'aller_retour'
export type JourSemaine = 'lu' | 'ma' | 'me' | 'je' | 've' | 'sa' | 'di'

export const JOURS_SEMAINE: { key: JourSemaine; label: string }[] = [
  { key: 'lu', label: 'Lu' }, { key: 'ma', label: 'Ma' }, { key: 'me', label: 'Me' },
  { key: 'je', label: 'Je' }, { key: 've', label: 'Ve' }, { key: 'sa', label: 'Sa' }, { key: 'di', label: 'Di' },
]

export interface Covoiturage {
  id: string
  user_id: string
  depart: string
  destination: string
  date_trajet: string         // YYYY-MM-DD
  heure_depart: string | null // "HH:MM" libre
  heure_arrivee: string | null
  prix: number                // 0 = gratuit
  places: number
  places_prises: number
  point_recup: string | null
  vehicule: string | null     // marque/modèle, ex: "Renault Clio gris"
  fumeur: boolean
  animaux: boolean
  bagages: boolean
  description: string | null
  statut: CovoitStatut
  is_completed: boolean       // conducteur a marqué le trajet effectué
  completed_at: string | null
  regulier: boolean           // récurrent (Karos-like) si true
  jours_semaine: JourSemaine[] // ['lu', 'ma', ...] si regulier=true
  sens: CovoitSens
  detour_minutes: number      // min à pied accepté au point de RDV
  created_at: string
  updated_at: string
}

/** Rating 1-5 du passager vers le conducteur, après trajet terminé. */
export interface CovoitRating {
  id: string
  conversation_id: string
  covoit_id: string
  passager_id: string
  conducteur_id: string
  note: 1 | 2 | 3 | 4 | 5
  comment: string | null
  created_at: string
}

/** Stats agrégées (vue covoit_conducteur_stats). */
export interface CovoitConducteurStats {
  user_id: string
  note_moyenne: number | null
  nombre_avis: number
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
  heure_arrivee?: string | null
  prix: number
  places: number
  point_recup?: string | null
  vehicule?: string | null
  fumeur: boolean
  animaux: boolean
  bagages: boolean
  description?: string | null
  regulier?: boolean
  jours_semaine?: JourSemaine[]
  sens?: CovoitSens
  detour_minutes?: number
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
  // Trajet régulier : jours_semaine requis
  if (input.regulier && (!input.jours_semaine || input.jours_semaine.length === 0)) {
    return 'Trajet régulier : sélectionne au moins un jour'
  }
  if (input.detour_minutes !== undefined && (input.detour_minutes < 0 || input.detour_minutes > 60)) {
    return 'Détour entre 0 et 60 min'
  }
  return null
}
