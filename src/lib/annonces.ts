/**
 * ANNONCES — La Place du Village
 *
 * Types et helpers métier pour le module Petites Annonces & Enchères.
 *
 * Source de vérité unique pour :
 *  - Les types autorisés par plan
 *  - La durée de vie d'une annonce selon le plan
 *  - Le quota de sponsoring par plan
 *  - Le calcul du prix affiché
 *  - La liste canonique des catégories
 */

import type { Plan } from './capabilities'

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export type AnnonceType = 'vente' | 'troc' | 'don' | 'enchere_inversee'

export type AnnonceStatut = 'active' | 'vendu' | 'expiree' | 'don_final'

export interface Annonce {
  id: string
  user_id: string
  type: AnnonceType
  titre: string
  description: string | null
  categorie: AnnonceCategorie
  photos: string[]
  prix_initial: number | null
  prix_actuel: number | null
  prix_seuil: number | null
  taux_baisse_pct: number | null
  contact_tel: string | null
  contact_email: string | null
  ville: string | null
  lat: number | null
  lng: number | null
  statut: AnnonceStatut
  expires_at: string
  vendu_at: string | null
  sponsored: boolean
  sponsored_until: string | null
  remise_main_propre: boolean
  garantie_jours: number
  created_at: string
  updated_at: string
}

export interface AnnonceRating {
  id: string
  conversation_id: string
  annonce_id: string
  acheteur_id: string
  vendeur_id: string
  note: number
  comment: string | null
  created_at: string
}

export interface VendeurStats {
  user_id: string
  note_moyenne: number | null
  notes_count: number
}

export interface AnnonceInteret {
  id: string
  annonce_id: string
  user_id: string
  message: string | null
  created_at: string
}

export interface AnnonceEncherePrise {
  id: string
  annonce_id: string
  user_id: string
  prix_pris: number
  created_at: string
}

export type ConversationStatut = 'open' | 'closed'

export interface AnnonceConversation {
  id: string
  annonce_id: string
  acheteur_id: string
  vendeur_id: string
  statut: ConversationStatut
  created_at: string
  updated_at: string
  closed_at: string | null
  closed_by: string | null
}

export type MessageKind = 'text' | 'system_contact' | 'system_closed'

export interface AnnonceMessage {
  id: string
  conversation_id: string
  sender_id: string | null
  kind: MessageKind
  content: string
  lu_at: string | null
  created_at: string
}

// ──────────────────────────────────────────────────────────────────────────
// Catégories canoniques
// ──────────────────────────────────────────────────────────────────────────

export const CATEGORIES_ANNONCES = [
  'immobilier',
  'vehicules',
  'multimedia',
  'maison',
  'jardin',
  'bricolage',
  'mode',
  'loisirs',
  'services',
  'animaux',
  'autres',
] as const

export type AnnonceCategorie = (typeof CATEGORIES_ANNONCES)[number]

export const CATEGORIES_LABELS: Record<AnnonceCategorie, string> = {
  immobilier: 'Immobilier',
  vehicules:  'Véhicules',
  multimedia: 'Multimédia',
  maison:     'Maison',
  jardin:     'Jardin',
  bricolage:  'Bricolage',
  mode:       'Mode',
  loisirs:    'Loisirs',
  services:   'Services',
  animaux:    'Animaux',
  autres:     'Autres',
}

export const CATEGORIES_ICONS: Record<AnnonceCategorie, string> = {
  immobilier: '🏠',
  vehicules:  '🚗',
  multimedia: '📱',
  maison:     '🛋️',
  jardin:     '🌱',
  bricolage:  '🔧',
  mode:       '👕',
  loisirs:    '🎮',
  services:   '🤝',
  animaux:    '🐾',
  autres:     '📦',
}

// ──────────────────────────────────────────────────────────────────────────
// Types autorisés par plan
// ──────────────────────────────────────────────────────────────────────────

const TYPES_BY_PLAN: Record<Plan, AnnonceType[]> = {
  basic: ['don'],
  pro:   ['vente', 'troc', 'don', 'enchere_inversee'],
  max:   ['vente', 'troc', 'don', 'enchere_inversee'],
}

export function getTypesAutorises(plan: Plan): AnnonceType[] {
  return TYPES_BY_PLAN[plan]
}

export function canCreateType(plan: Plan, type: AnnonceType): boolean {
  return TYPES_BY_PLAN[plan].includes(type)
}

// ──────────────────────────────────────────────────────────────────────────
// Durée de vie d'une annonce (en jours)
// ──────────────────────────────────────────────────────────────────────────

export function getDureeAnnonceJours(plan: Plan): number {
  return plan === 'basic' ? 21 : 30
}

// ──────────────────────────────────────────────────────────────────────────
// Quota sponsoring
// ──────────────────────────────────────────────────────────────────────────

export const SPONSORING_DUREE_JOURS = 5

export function getQuotaSponsoring(plan: Plan): number {
  if (plan === 'max') return 3
  if (plan === 'pro') return 1
  return 0
}

export function canSponsor(plan: Plan): boolean {
  return getQuotaSponsoring(plan) > 0
}

// ──────────────────────────────────────────────────────────────────────────
// Affichage prix
// ──────────────────────────────────────────────────────────────────────────

/**
 * Retourne le label de prix à afficher selon le type/statut.
 * - vente : prix_initial
 * - enchere_inversee active : prix_actuel (qui décroît)
 * - don / don_final : "Gratuit"
 * - troc : "À échanger"
 */
export function getPrixAffiche(a: Annonce): string {
  if (a.type === 'don' || a.statut === 'don_final') return 'Gratuit'
  if (a.type === 'troc') return 'À échanger'
  if (a.type === 'enchere_inversee') {
    const p = a.prix_actuel ?? a.prix_initial
    return p != null ? `${formatEuros(p)} (enchère ↓)` : 'Enchère'
  }
  return a.prix_initial != null ? formatEuros(a.prix_initial) : 'Prix non indiqué'
}

export function formatEuros(n: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n)
}

// ──────────────────────────────────────────────────────────────────────────
// Enchère inversée — countdown jusqu'à la prochaine baisse (minuit)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Retourne la date/heure de la prochaine baisse (minuit suivant).
 * Le cron tourne à 00:00 chaque nuit.
 */
export function getNextDropDate(now: Date = new Date()): Date {
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)
  return tomorrow
}

/**
 * Formate un countdown en "Xh Ym Zs" à partir de millisecondes restantes.
 */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return '0s'
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`
  return `${sec}s`
}

/**
 * Combien d'euros perdus à la prochaine baisse.
 */
export function getProchaineBaisse(a: Annonce): number {
  if (a.type !== 'enchere_inversee' || a.prix_actuel == null || a.taux_baisse_pct == null) return 0
  return Math.round(a.prix_actuel * a.taux_baisse_pct) / 100
}

/**
 * Timeline des prix pour graphique : [aujourd'hui, J+1, J+2, ...] jusqu'au seuil.
 * Max 8 points pour pas charger l'UI.
 */
export function getPrixTimeline(a: Annonce, maxPoints = 8): { jour: number; prix: number }[] {
  if (a.type !== 'enchere_inversee' || a.prix_actuel == null || a.taux_baisse_pct == null) return []
  const factor = 1 - a.taux_baisse_pct / 100
  const seuil = a.prix_seuil ?? 0
  const out: { jour: number; prix: number }[] = []
  let prix = a.prix_actuel
  for (let j = 0; j < maxPoints; j++) {
    out.push({ jour: j, prix: Math.round(prix * 100) / 100 })
    prix = prix * factor
    if (prix <= seuil) {
      out.push({ jour: j + 1, prix: Math.round(Math.max(prix, seuil) * 100) / 100 })
      break
    }
  }
  return out
}

// ──────────────────────────────────────────────────────────────────────────
// Enchère inversée — préview de la baisse
// ──────────────────────────────────────────────────────────────────────────

/**
 * Combien de jours avant que prix_actuel atteigne prix_seuil ?
 * Retourne null si pas d'enchère ou pas de seuil.
 */
export function getJoursAvantSeuil(a: Annonce): number | null {
  if (a.type !== 'enchere_inversee') return null
  if (a.prix_actuel == null || a.prix_seuil == null || a.taux_baisse_pct == null) return null
  if (a.taux_baisse_pct <= 0 || a.prix_actuel <= a.prix_seuil) return 0

  const ratio = a.prix_seuil / a.prix_actuel
  const factor = 1 - a.taux_baisse_pct / 100
  if (factor <= 0 || factor >= 1) return null

  return Math.ceil(Math.log(ratio) / Math.log(factor))
}

// ──────────────────────────────────────────────────────────────────────────
// Validation côté API (les CHECK constraints PG sont silencieuses → on valide ici)
// ──────────────────────────────────────────────────────────────────────────

export const ANNONCE_TYPES: AnnonceType[] = ['vente', 'troc', 'don', 'enchere_inversee']
export const ANNONCE_STATUTS: AnnonceStatut[] = ['active', 'vendu', 'expiree', 'don_final']

export function isAnnonceType(v: unknown): v is AnnonceType {
  return typeof v === 'string' && ANNONCE_TYPES.includes(v as AnnonceType)
}

export function isAnnonceCategorie(v: unknown): v is AnnonceCategorie {
  return typeof v === 'string' && (CATEGORIES_ANNONCES as readonly string[]).includes(v)
}

export interface AnnonceCreateInput {
  type: AnnonceType
  titre: string
  description?: string | null
  categorie: AnnonceCategorie
  photos?: string[]
  prix_initial?: number | null
  prix_seuil?: number | null
  taux_baisse_pct?: number | null
  contact_tel?: string | null
  contact_email?: string | null
  ville?: string | null
  lat?: number | null
  lng?: number | null
  remise_main_propre?: boolean
  garantie_jours?: number | null
}

/**
 * Valide les données du formulaire selon le type d'annonce.
 * Retourne null si OK, sinon un message d'erreur.
 */
export function validateAnnonceInput(
  input: AnnonceCreateInput,
  plan: Plan,
): string | null {
  if (!input.titre?.trim()) return 'Le titre est requis'
  if (!isAnnonceType(input.type)) return 'Type invalide'
  if (!isAnnonceCategorie(input.categorie)) return 'Catégorie invalide'
  if (!canCreateType(plan, input.type)) {
    return `Le plan ${plan} ne permet pas ce type d'annonce`
  }

  // Au moins un contact (tel OU email) — c'est ce qui sera partagé via le chat
  const hasTel   = !!input.contact_tel?.trim()
  const hasEmail = !!input.contact_email?.trim()
  if (!hasTel && !hasEmail) {
    return 'Au moins un contact requis (téléphone ou email)'
  }

  if (input.type === 'vente') {
    if (input.prix_initial == null || input.prix_initial <= 0) {
      return 'Une vente nécessite un prix > 0'
    }
  }

  if (input.type === 'enchere_inversee') {
    if (input.prix_initial == null || input.prix_initial <= 0) {
      return 'Une enchère nécessite un prix de départ > 0'
    }
    if (input.taux_baisse_pct == null || input.taux_baisse_pct <= 0 || input.taux_baisse_pct >= 100) {
      return 'Le taux de baisse doit être entre 0 et 100 %'
    }
    if (input.prix_seuil != null && input.prix_seuil >= input.prix_initial) {
      return 'Le seuil doit être inférieur au prix de départ'
    }
    if (input.prix_seuil != null && input.prix_seuil < 0) {
      return 'Le seuil ne peut pas être négatif'
    }
  }

  return null
}
