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
  image_position: string | null
  source: string | null
  score_confiance: number | null
  created_at: string
  lieux: Lieu | null
  promotion: 'basic' | 'pro' | 'max' | null
  promo_ordre: number | null
  submitted_by: string | null
  submitted_by_name: string | null
  vote_count: number
  publish_at: string | null
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
  date_fin: string | null
  heure: string | null
  image_url: string | null
  image_position: string | null
  lieux: LieuCard | null
  promotion: 'basic' | 'pro' | 'max' | null
  promo_ordre: number | null
  vote_count: number
  submitted_by_name: string | null
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

export type AppMode = 'agenda' | 'annuaire'

export type ProduitCategorie =
  | 'fruits_legumes' | 'viandes' | 'fromages_laitages' | 'oeufs'
  | 'pain' | 'miel' | 'panier' | 'plantes' | 'huiles' | 'boissons'
  | 'artisanat' | 'autre'

export type NotifType = 'disponibilite' | 'nouveau_produit' | 'suivi_producteur' | 'commentaire' | 'claim_approved' | 'claim_rejected' | 'claim_pending' | 'promo_used' | 'annonce_interet_recu' | 'annonce_enchere_prise' | 'annonce_expire_bientot' | 'annonce_devient_don' | 'annonce_message' | 'annonce_contact_partage' | 'annonce_vente_close' | 'annonce_note_recue' | 'event_published' | 'support_message' | 'journal_publie' | 'article_like' | 'article_comment' | 'covoit_candidat' | 'covoit_message' | 'covoit_validee' | 'covoit_refusee' | 'covoit_closed'

export interface AppNotification {
  id: string
  user_id: string
  type: NotifType
  actor_id: string | null
  actor_name: string | null
  target_id: string | null
  target_type: 'producer' | 'event' | 'etablissement' | 'claim' | 'promotion' | 'annonce' | 'conversation' | 'support_conversation' | 'journal' | 'article' | null
  lu: boolean
  created_at: string
}

export type EtablissementType = 'restaurant_bar' | 'hebergement' | 'artisan_service' | 'sante_bien_etre' | 'activite'

export interface EtablissementCard {
  id: string
  type: EtablissementType
  nom: string
  commune: string | null
  lat: number | null
  lng: number | null
  photos: string[]
  note_google: number | null
  is_featured: boolean
  statut: string
  description_courte: string | null
  plan: string
}

export interface Etablissement extends EtablissementCard {
  user_id: string | null
  description_longue: string | null
  adresse: string | null
  contact_tel: string | null
  contact_whatsapp: string | null
  site_web: string | null
  horaires: Record<string, string> | null
  place_id_google: string | null
  plan: string
  created_at: string
  updated_at: string
}

export interface ProducerCard {
  id: string
  nom: string
  description_courte: string | null
  commune: string | null
  photo_url: string | null
  contact_whatsapp: string | null
  contact_tel: string | null
  site_web: string | null
  produit_categories: ProduitCategorie[]
  produits_disponibles: { nom: string; categorie: string; prix_indicatif: string | null; periode_dispo: string | null }[]
  lat: number | null
  lng: number | null
  is_max: boolean
  is_featured: boolean
  user_id?: string | null
}
