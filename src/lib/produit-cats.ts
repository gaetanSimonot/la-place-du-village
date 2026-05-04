import { ProduitCategorie } from './types'

export const PRODUIT_CATS: { id: ProduitCategorie; label: string; emoji: string }[] = [
  { id: 'fruits_legumes',    label: 'Fruits & Légumes',       emoji: '🥬' },
  { id: 'viandes',           label: 'Viandes & Charcuteries', emoji: '🥩' },
  { id: 'fromages_laitages', label: 'Fromages & Laitages',    emoji: '🧀' },
  { id: 'oeufs',             label: 'Œufs',                   emoji: '🥚' },
  { id: 'pain',              label: 'Pain & Pâtisseries',     emoji: '🍞' },
  { id: 'miel',              label: 'Miel & Confitures',      emoji: '🍯' },
  { id: 'panier',            label: 'Panier de saison',       emoji: '🧺' },
  { id: 'plantes',           label: 'Plantes & Fleurs',       emoji: '🌿' },
  { id: 'huiles',            label: 'Huiles & Condiments',    emoji: '🫙' },
  { id: 'boissons',          label: 'Boissons',               emoji: '🍾' },
  { id: 'artisanat',         label: 'Artisanat',              emoji: '🏺' },
  { id: 'autre',             label: 'Autre',                   emoji: '✦'  },
]

export const PRODUIT_CATS_MAP: Record<string, { label: string; emoji: string }> =
  Object.fromEntries(PRODUIT_CATS.map(c => [c.id, { label: c.label, emoji: c.emoji }]))

// Anciens IDs (avant regroupement) → nouveaux IDs groupés
const LEGACY: Record<string, ProduitCategorie> = {
  legumes:    'fruits_legumes',
  fruits:     'fruits_legumes',
  tomates:    'fruits_legumes',
  viande:     'viandes',
  volaille:   'viandes',
  charcuterie:'viandes',
  fromage:    'fromages_laitages',
  lait:       'fromages_laitages',
  laitage:    'fromages_laitages',
}

export function normalizeProduitCat(cat: string): ProduitCategorie {
  return LEGACY[cat] ?? (cat as ProduitCategorie)
}

export const PRODUIT_CAT_ICONS: Record<string, string> = {
  fruits_legumes:    '/icons/fruits-legumes.png',
  viandes:           '/icons/viandes.png',
  fromages_laitages: '/icons/fromages-laitages.png',
  oeufs:             '/icons/oeufs.png',
  pain:              '/icons/pain.png',
  miel:              '/icons/miel.png',
  panier:            '/icons/panier.png',
  plantes:           '/icons/plantes.png',
  huiles:            '/icons/autre.png',
  boissons:          '/icons/boissons.png',
  artisanat:         '/icons/artisanat.png',
  autre:             '/icons/autre.png',
}
