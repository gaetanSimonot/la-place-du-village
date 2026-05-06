import type { EtablissementType } from './types'

export const ETAB_TYPES: Record<EtablissementType, { label: string; emoji: string; color: string; bg: string }> = {
  restaurant_bar:  { label: 'Restos & Bars',      emoji: '🍽️', color: '#C0440A', bg: '#FDE8DF' },
  hebergement:     { label: 'Hébergement',          emoji: '🏡', color: '#2563EB', bg: '#DBEAFE' },
  artisan_service: { label: 'Artisans & Services',  emoji: '🔧', color: '#7C5C3B', bg: '#F0E8DC' },
  sante_bien_etre: { label: 'Santé & Bien-être',    emoji: '💆', color: '#7B2D8B', bg: '#F3E8FF' },
  activite:        { label: 'Activités',             emoji: '🎯', color: '#166534', bg: '#DCFCE7' },
}

// Marker SVG pour la carte Google Maps — forme "pin arrondi" distincte des producteurs (larme)
export function etabMarkerSvg(selected: boolean, type: EtablissementType, plan?: string | null): string {
  const COLORS: Record<EtablissementType, string> = {
    restaurant_bar:  '#C0440A',
    hebergement:     '#2563EB',
    artisan_service: '#7C5C3B',
    sante_bien_etre: '#7B2D8B',
    activite:        '#166534',
  }
  const c      = COLORS[type] ?? '#555'
  const isMax  = plan === 'max'
  const isPro  = plan === 'pro'
  // base scale: max > selected > pro > regular
  const scale  = isMax ? 1.45 : selected ? 1.3 : isPro ? 1.15 : 1
  const w      = Math.round(28 * scale)
  const h      = Math.round((isMax ? 44 : 36) * scale)   // extra height for star above pin
  const vbH    = isMax ? 44 : 36
  const starY  = isMax ? 4 : 0
  const pinTop = isMax ? 8 : 0

  const halo = (isMax && !selected)
    ? `<ellipse cx="14" cy="${13 + pinTop}" rx="16" ry="14" fill="${c}" opacity="0.14"/>`
    : (isPro && !selected)
    ? `<ellipse cx="14" cy="${13 + pinTop}" rx="15" ry="13" fill="${c}" opacity="0.10"/>`
    : ''
  const glow = selected
    ? `<ellipse cx="14" cy="${13 + pinTop}" rx="16" ry="14" fill="${c}" opacity="0.20"/>`
    : ''
  const star = isMax
    ? `<text x="14" y="${starY + 1}" text-anchor="middle" dominant-baseline="hanging" font-size="9" fill="${c}" opacity="0.95" font-family="sans-serif">✦</text>`
    : ''
  const strokeW = selected ? 2.5 : isMax ? 2 : isPro ? 1.8 : 2
  const strokeColor = (isMax || isPro) ? 'white' : 'white'

  const svg = `<svg width="${w}" height="${h}" viewBox="0 0 28 ${vbH}" xmlns="http://www.w3.org/2000/svg">
    ${halo}${glow}
    ${star}
    <path d="M14 ${1 + pinTop}C7.37 ${1 + pinTop} 2 ${6.37 + pinTop} 2 ${13 + pinTop}c0 9 12 22 12 22S26 ${22 + pinTop} 26 ${13 + pinTop}C26 ${6.37 + pinTop} 20.63 ${1 + pinTop} 14 ${1 + pinTop}z" fill="${c}" stroke="${strokeColor}" stroke-width="${strokeW}"/>
    <circle cx="14" cy="${13 + pinTop}" r="5" fill="white" opacity="0.9"/>
  </svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export const ETAB_TYPE_LIST = Object.entries(ETAB_TYPES).map(([id, v]) => ({ id: id as EtablissementType, ...v }))
