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
