import { parseVisibilite, type Visibilite } from '@/lib/visibilite'

/**
 * « DANS NOS BOIS » — le guide des champignons. Partagé client et serveur :
 * n'importe JAMAIS supabase-admin (cf. cinema.ts / cinema-server.ts).
 *
 * Les fiches viennent de la table `champignons` ; ce fichier ne porte que le
 * VOCABULAIRE des filtres (libellés, pastilles de couleur), qui est celui du
 * guide d'origine, et les règles qui en découlent.
 */

export type Statut = 'excellent' | 'bon' | 'comestible' | 'prudence' | 'non' | 'toxique' | 'mortel'
export type Milieu = 'feuillus' | 'pins' | 'prairie' | 'bois'
export type Couleur = 'blanc' | 'jaune' | 'orange' | 'rouge' | 'brun' | 'gris' | 'violet' | 'vert'

export interface Sosie { nom: string; latin: string | null; note: string | null }

export interface Champignon {
  id: string
  nom: string
  nom_latin: string
  statut: Statut
  milieux: Milieu[]
  couleurs: Couleur[]
  saison: string | null
  reconnaitre: string[]
  sosies: Sosie[]
  cuisine: string | null
  danger: string | null
  photo_url: string | null
  photo_credit: string | null
  ordre: number
}

export const STATUTS: Record<Statut, string> = {
  excellent:  'Excellent comestible',
  bon:        'Bon comestible',
  comestible: 'Comestible',
  prudence:   'Comestible avec précautions',
  non:        'Non comestible',
  toxique:    'Toxique',
  mortel:     'Mortel',
}

/** Ce qui se mange — « avec précautions » compris, comme dans le guide. */
export const MANGEABLES = new Set<Statut>(['excellent', 'bon', 'comestible', 'prudence'])

export const MILIEUX: { id: Milieu; label: string; court: string }[] = [
  { id: 'feuillus', label: 'Chênes, châtaigniers', court: 'Chênes, châtaigniers' },
  { id: 'pins',     label: 'Pins',                 court: 'Pins' },
  { id: 'prairie',  label: 'Prairies, pelouses',   court: 'Prairies' },
  { id: 'bois',     label: 'Sur le bois',          court: 'Sur le bois' },
]

export const COULEURS: { id: Couleur; label: string; teinte: string }[] = [
  { id: 'blanc',  label: 'Blanc, crème', teinte: '#F2EFE6' },
  { id: 'jaune',  label: 'Jaune',        teinte: '#E8C534' },
  { id: 'orange', label: 'Orange',       teinte: '#E5832B' },
  { id: 'rouge',  label: 'Rouge',        teinte: '#C92A2A' },
  { id: 'brun',   label: 'Brun',         teinte: '#7A5233' },
  { id: 'gris',   label: 'Gris, noir',   teinte: '#4B4F52' },
  { id: 'violet', label: 'Violet',       teinte: '#7B4FA0' },
  { id: 'vert',   label: 'Vert, olive',  teinte: '#8A9A3C' },
]

export function libelleMilieu(m: Milieu): string {
  return MILIEUX.find(x => x.id === m)?.label ?? m
}

/** Recherche sans accents ni casse : « cepe » trouve « Cèpe ». */
export function normaliser(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export type VisibiliteBois = Visibilite
export function parseVisibiliteBois(v: unknown): VisibiliteBois {
  return parseVisibilite(typeof v === 'string' ? v : null)
}
