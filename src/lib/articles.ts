import type { Plan } from './capabilities'

export type ArticleStatut = 'en_attente' | 'valide' | 'refuse' | 'publie'

export interface ArticleJournal {
  id: string
  user_id: string | null
  titre: string
  corps: string
  photo_url: string | null
  statut: ArticleStatut
  refus_motif: string | null
  journal_id: string | null
  created_at: string
  updated_at: string
}

export interface ArticleCreateInput {
  titre: string
  corps: string
  photo_url?: string | null
}

// Plans autorisés à soumettre un article journal : Habitants + Pro.
// Basic (Villageois gratuit) ne peut pas (cohérent avec "accessible au premier
// abonnement payant").
export function canSubmitArticleJournal(plan: Plan): boolean {
  return plan === 'habitants' || plan === 'pro'
}

export function validateArticleInput(input: ArticleCreateInput): string | null {
  if (!input.titre?.trim()) return 'Le titre est requis'
  if (input.titre.trim().length < 5) return 'Le titre doit faire au moins 5 caractères'
  if (input.titre.trim().length > 120) return 'Le titre est trop long (120 max)'
  if (!input.corps?.trim()) return 'Le corps de l\'article est requis'
  if (input.corps.trim().length < 80) return 'Le corps doit faire au moins 80 caractères'
  if (input.corps.trim().length > 4000) return 'Le corps est trop long (4000 max)'
  return null
}
