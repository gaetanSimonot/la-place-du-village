export interface Lieu {
  id: string
  nom: string
  adresse: string | null
  lat: number | null
  lng: number | null
  place_id_google: string | null
  commune: string | null
  code_postal: string | null
  created_at: string
}

export interface Evenement {
  id: string
  titre: string
  description: string | null
  date_debut: string | null
  date_fin: string | null
  heure: string | null
  categorie: Categorie
  statut: 'publie' | 'en_attente' | 'rejete' | 'archive' | 'a_verifier'
  doublon_verifie: boolean
  lieu_id: string | null
  prix: string | null
  contact: string | null
  organisateurs: string | null
  image_url: string | null
  source: string | null
  score_confiance: number | null
  created_at: string
  lieux: Lieu | null
}

// Type allégé pour l'affichage public (carte + liste)
// Ne charge pas description, prix, contact, etc.
export interface LieuCard {
  id: string
  nom: string
  commune: string | null
  lat: number | null
  lng: number | null
  place_id_google: string | null
}

export interface EvenementCard {
  id: string
  titre: string
  categorie: Categorie
  date_debut: string | null
  heure: string | null
  image_url: string | null
  lieux: LieuCard | null
}

export function isApproxLocation(lieu: Lieu | LieuCard | null): boolean {
  return !!lieu && lieu.lat !== null && lieu.place_id_google === null
}

export type Categorie = 'concert' | 'theatre' | 'sport' | 'marche' | 'atelier' | 'fete' | 'autre'
export type FiltreQuand = 'toujours' | 'aujourd_hui' | 'ce_week_end' | 'cette_semaine' | 'ce_mois'

export interface Filtres {
  categories: Categorie[]
  quand: FiltreQuand
}
