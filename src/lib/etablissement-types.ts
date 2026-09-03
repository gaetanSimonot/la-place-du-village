import type { EtablissementType } from './types'

export const ETAB_TYPES: Record<EtablissementType, { label: string; emoji: string; color: string; bg: string }> = {
  restaurant_bar:  { label: 'Restos & Bars',      emoji: '🍽️', color: '#C0440A', bg: '#FDE8DF' },
  hebergement:     { label: 'Hébergement',          emoji: '🏡', color: '#2563EB', bg: '#DBEAFE' },
  artisan_service: { label: 'Artisans & Services',  emoji: '🔧', color: '#7C5C3B', bg: '#F0E8DC' },
  sante_bien_etre: { label: 'Santé & Bien-être',    emoji: '💆', color: '#7B2D8B', bg: '#F3E8FF' },
  activite:        { label: 'Activités',             emoji: '🎯', color: '#166534', bg: '#DCFCE7' },
}

// Marker SVG pour la carte Google Maps — forme "pin arrondi" distincte des producteurs (larme)
// promoted (pro/max/featured) : étoile rose ✦ au-dessus uniquement, même taille que regular
export function etabMarkerSvg(selected: boolean, type: EtablissementType, plan?: string | null, isFeatured?: boolean): string {
  const COLORS: Record<EtablissementType, string> = {
    restaurant_bar:  '#C0440A',
    hebergement:     '#2563EB',
    artisan_service: '#7C5C3B',
    sante_bien_etre: '#7B2D8B',
    activite:        '#166534',
  }
  const c        = COLORS[type] ?? '#555'
  const promoted = plan === 'pro' || !!isFeatured
  const starH    = promoted ? 11 : 0   // espace réservé pour l'étoile
  const h        = 36 + starH          // hauteur totale SVG
  const pt       = starH               // décalage vertical du pin

  const star = promoted
    ? `<text x="14" y="${starH - 1}" text-anchor="middle" dominant-baseline="auto" font-size="10" fill="#EC407A" opacity="0.92" font-family="sans-serif">✦</text>`
    : ''
  const sw = selected ? 2.5 : 2

  const svg = `<svg width="28" height="${h}" viewBox="0 0 28 ${h}" xmlns="http://www.w3.org/2000/svg">
    ${star}
    <path d="M14 ${1+pt}C7.37 ${1+pt} 2 ${6.37+pt} 2 ${13+pt}c0 9 12 22 12 22S26 ${22+pt} 26 ${13+pt}C26 ${6.37+pt} 20.63 ${1+pt} 14 ${1+pt}z" fill="${c}" stroke="white" stroke-width="${sw}" opacity="${selected ? 1 : 0.88}"/>
    <circle cx="14" cy="${13+pt}" r="5" fill="white" opacity="0.9"/>
  </svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export const ETAB_TYPE_LIST = Object.entries(ETAB_TYPES).map(([id, v]) => ({ id: id as EtablissementType, ...v }))

/**
 * Ce que la fiche affiche vraiment dans « À propos ».
 *
 * `description_courte` et `description_longue` ont deux rôles DIFFÉRENTS :
 *   - l'accroche : listes de l'annuaire, vignette de la carte, recherche
 *   - la présentation : le corps de la fiche
 *
 * Mais la création d'une fiche dérive l'accroche de la présentation (même
 * texte, tronqué à 180 caractères) : le propriétaire n'écrit qu'un texte, et
 * la fiche affichait les deux l'un sous l'autre — mot pour mot identiques.
 * Constaté sur OB PLOMBERIE et La Cantine BioEnsemble.
 *
 * Règles :
 *   - accroche reprise par la présentation (ou identique) → on ne montre que
 *     la présentation ;
 *   - accroche réellement distincte (une signature, un slogan) → on garde les
 *     deux, c'est une intention éditoriale ;
 *   - pas de présentation → l'accroche EST la fiche, sinon « À propos » serait
 *     vide alors qu'un texte existe.
 *
 * SOURCE UNIQUE : la fiche publique et l'aperçu de l'éditeur appellent cette
 * fonction. Elles ne peuvent donc pas se contredire — c'était tout le problème
 * de l'éditeur, qui ne montrait pas ce qui allait réellement s'afficher.
 */
export function descriptionsFiche(
  courte?: string | null,
  longue?: string | null,
): { accroche: string | null; presentation: string | null; accrocheMasquee: boolean } {
  const c = courte?.trim() || null
  const l = longue?.trim() || null

  if (!l) return { accroche: null, presentation: c, accrocheMasquee: false }
  if (!c) return { accroche: null, presentation: l, accrocheMasquee: false }

  // Comparaison tolérante : espaces multiples, casse, et le « … » que la
  // troncature ajoute en fin d'accroche.
  const norm = (s: string) =>
    s.replace(/\s+/g, ' ').replace(/[…\.]+$/, '').trim().toLowerCase()

  const doublon = norm(l).startsWith(norm(c))
  return {
    accroche: doublon ? null : c,
    presentation: l,
    accrocheMasquee: doublon,
  }
}
