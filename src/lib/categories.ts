import { Categorie } from './types'

export const CATEGORIES: Record<Categorie, { label: string; emoji: string; color: string }> = {
  concert: { label: 'Concert',  emoji: '🎵', color: '#E74C3C' },
  theatre: { label: 'Théâtre',  emoji: '🎭', color: '#9B59B6' },
  sport:   { label: 'Sport',    emoji: '⚽', color: '#27AE60' },
  marche:  { label: 'Marché',   emoji: '🛒', color: '#F39C12' },
  atelier: { label: 'Atelier',  emoji: '🎨', color: '#3498DB' },
  fete:    { label: 'Fête',     emoji: '🎉', color: '#E91E63' },
  autre:   { label: 'Autre',    emoji: '📌', color: '#95A5A6' },
}
