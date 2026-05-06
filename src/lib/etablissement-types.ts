import type { EtablissementType } from './types'

export const ETAB_TYPES: Record<EtablissementType, { label: string; emoji: string; color: string; bg: string }> = {
  restaurant_bar:  { label: 'Restos & Bars',      emoji: '🍽️', color: '#C0440A', bg: '#FDE8DF' },
  hebergement:     { label: 'Hébergement',          emoji: '🏡', color: '#2563EB', bg: '#DBEAFE' },
  artisan_service: { label: 'Artisans & Services',  emoji: '🔧', color: '#7C5C3B', bg: '#F0E8DC' },
  sante_bien_etre: { label: 'Santé & Bien-être',    emoji: '💆', color: '#7B2D8B', bg: '#F3E8FF' },
  activite:        { label: 'Activités',             emoji: '🎯', color: '#166534', bg: '#DCFCE7' },
}

// Marker SVG pour la carte Google Maps — forme "pin arrondi" distincte des producteurs (larme)
export function etabMarkerSvg(selected: boolean, type: EtablissementType): string {
  const COLORS: Record<EtablissementType, string> = {
    restaurant_bar:  '#C0440A',
    hebergement:     '#2563EB',
    artisan_service: '#7C5C3B',
    sante_bien_etre: '#7B2D8B',
    activite:        '#166534',
  }
  const c = COLORS[type] ?? '#555'
  const s = selected ? 1.3 : 1
  const w = Math.round(28 * s)
  const h = Math.round(36 * s)
  const svg = `<svg width="${w}" height="${h}" viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 1C7.37 1 2 6.37 2 13c0 9 12 22 12 22S26 22 26 13C26 6.37 20.63 1 14 1z" fill="${c}" stroke="white" stroke-width="${selected ? 2.5 : 2}"/>
    <circle cx="14" cy="13" r="5" fill="white" opacity="0.9"/>
  </svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export const ETAB_TYPE_LIST = Object.entries(ETAB_TYPES).map(([id, v]) => ({ id: id as EtablissementType, ...v }))
