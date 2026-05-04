// ─── Thèmes de couleur ───────────────────────────────────────────
export interface ColorTheme {
  id: string
  name: string
  description: string
  primary: string   // --primary
  primaryLight: string // fondo pills actifs
  bg: string        // --creme
}

export const COLOR_THEMES: ColorTheme[] = [
  {
    id: 'foret',
    name: 'Forêt',
    description: 'Nature Cévennes',
    primary: '#2D5A3D',
    primaryLight: '#E8F2EB',
    bg: '#FDFAF5',
  },
  {
    id: 'terrecuite',
    name: 'Terre cuite',
    description: 'Chaleur du Midi',
    primary: '#C4622D',
    primaryLight: '#FFF4F0',
    bg: '#FAF7F2',
  },
  {
    id: 'garrigue',
    name: 'Garrigue',
    description: 'Nature Cévennes',
    primary: '#5B8C5A',
    primaryLight: '#F0F5EF',
    bg: '#F5FAF4',
  },
  {
    id: 'lavande',
    name: 'Lavande',
    description: 'Provence douce',
    primary: '#7B6FB5',
    primaryLight: '#F5F3FF',
    bg: '#FAF9FF',
  },
  {
    id: 'marine',
    name: 'Marine',
    description: 'Méditerranée',
    primary: '#2B6CB0',
    primaryLight: '#EEF5FF',
    bg: '#F5F9FF',
  },
  {
    id: 'corail',
    name: 'Corail',
    description: 'Vif et lumineux',
    primary: '#D64045',
    primaryLight: '#FFF0F0',
    bg: '#FFF8F8',
  },
]

// ─── Styles de carte ─────────────────────────────────────────────
export interface MapStyleDef {
  id: string
  name: string
  description: string
  previewBg: string  // couleur représentative du style
  styles: google.maps.MapTypeStyle[]
}

export const MAP_STYLES: MapStyleDef[] = [
  {
    id: 'warm',
    name: 'Warm',
    description: 'Tons chauds sudistes',
    previewBg: '#ede3d4',
    styles: [
      { elementType: 'geometry', stylers: [{ color: '#ede8df' }] },
      { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f1eb' }] },
      { elementType: 'labels.text.fill', stylers: [{ color: '#7a6a5a' }] },
      { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#aac4d8' }] },
      { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#7a9ab0' }] },
      { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#e4ddd2' }] },
      { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#d8cfc2' }] },
      { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#f8f3ec' }] },
      { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#ddd4c4' }] },
      { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#f4d97a' }] },
      { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#e8c860' }] },
      { featureType: 'road.highway.controlled_access', elementType: 'geometry', stylers: [{ color: '#e8a055' }] },
      { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#d4cbba' }] },
      { featureType: 'poi.park', elementType: 'geometry.fill', stylers: [{ color: '#b8c89a' }] },
      { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
      { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
      { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
      { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#c5b9a8' }] },
      { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#8c6e5a' }] },
    ],
  },
  {
    id: 'standard',
    name: 'Standard',
    description: 'Google classique',
    previewBg: '#e8f0e8',
    styles: [
      { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
      { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
      { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    ],
  },
  {
    id: 'sombre',
    name: 'Sombre',
    description: 'Mode nuit',
    previewBg: '#1a1f2e',
    styles: [
      { elementType: 'geometry', stylers: [{ color: '#1d2232' }] },
      { elementType: 'labels.text.stroke', stylers: [{ color: '#1d2232' }] },
      { elementType: 'labels.text.fill', stylers: [{ color: '#8b9ab0' }] },
      { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0a0e1a' }] },
      { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#151a28' }] },
      { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c3347' }] },
      { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#171c2c' }] },
      { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3d4a6b' }] },
      { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#252d46' }] },
      { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#1e2535' }] },
      { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1a2e20' }] },
      { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
      { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
      { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
      { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#2c3347' }] },
      { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#a0aec0' }] },
    ],
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Épuré, discret',
    previewBg: '#f5f5f0',
    styles: [
      { elementType: 'geometry', stylers: [{ color: '#f5f5f0' }] },
      { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f0' }] },
      { elementType: 'labels.text.fill', stylers: [{ color: '#a0a0a0' }] },
      { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c8d8e8' }] },
      { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#eeeeea' }] },
      { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
      { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#e0e0e0' }] },
      { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#e8e8e0' }] },
      { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#e8e8e0' }] },
      { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#dce8d0' }] },
      { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
      { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
      { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
      { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#d0d0d0' }] },
    ],
  },
  {
    id: 'retro',
    name: 'Rétro',
    description: 'Carte ancienne',
    previewBg: '#c8b89a',
    styles: [
      { elementType: 'geometry', stylers: [{ color: '#ebe3cd' }] },
      { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f1e6' }] },
      { elementType: 'labels.text.fill', stylers: [{ color: '#523735' }] },
      { featureType: 'water', elementType: 'geometry.fill', stylers: [{ color: '#8ab4c8' }] },
      { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#65849a' }] },
      { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#dfd2ae' }] },
      { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#f5f1e6' }] },
      { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#fdfcf8' }] },
      { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#f8c967' }] },
      { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#e9bc62' }] },
      { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#dfd2ae' }] },
      { featureType: 'poi.park', elementType: 'geometry.fill', stylers: [{ color: '#a5b076' }] },
      { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
      { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
      { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
      { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#dfd2ae' }] },
      { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#c9b2a6' }] },
    ],
  },
]

export const DEFAULT_COLOR_THEME = 'foret'
export const DEFAULT_MAP_STYLE   = 'warm'

// ─── Fond de la liste (BottomSheet) ──────────────────────────────
export interface SheetBg {
  id: string
  name: string
  bg: string    // --sheet-bg
  text: string  // --sheet-text
  sub: string   // textes secondaires / compteur
  border: string
  pill: string  // fond des pills filtres
  pillText: string
}

export const SHEET_BG_OPTIONS: SheetBg[] = [
  { id: 'blanc',      name: 'Blanc',      bg: '#FDFAF5',  text: '#1A1209', sub: '#6B5E4E', border: '#E8E0D4', pill: '#EDE8DF', pillText: '#6B5E4E' },
  { id: 'creme',      name: 'Crème',      bg: '#F5EFE4',  text: '#1A1209', sub: '#6B5E4E', border: '#E0D8CC', pill: '#E8E0D4', pillText: '#6B5E4E' },
  { id: 'ardoise',    name: 'Ardoise',    bg: '#2C3347',  text: '#E8E0D5', sub: '#8A96B0', border: '#3A4260', pill: '#353D55', pillText: '#E8E0D5' },
  { id: 'nuit',       name: 'Nuit',       bg: '#1a1f2e',  text: '#C8D0E0', sub: '#6B7A9A', border: '#252D45', pill: '#202638', pillText: '#C8D0E0' },
  { id: 'anthracite', name: 'Anthracite', bg: '#1C1C1E',  text: '#E5E5EA', sub: '#6E6E73', border: '#2C2C2E', pill: '#252527', pillText: '#E5E5EA' },
  { id: 'bois',       name: 'Bois',       bg: '#2C1810',  text: '#F5F1EB', sub: '#9A8070', border: '#3D2418', pill: '#361E12', pillText: '#F5F1EB' },
]

export const DEFAULT_SHEET_BG = 'blanc'
