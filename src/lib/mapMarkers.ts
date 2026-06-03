// Générateurs de marqueurs SVG partagés entre MapView (Google) et MapViewMaplibre.
// Forme « goutte » (cercle + pointe), couleurs par catégorie, cache par clé.
import { CATEGORIES } from '@/lib/categories'

// Cache SVG par clé — évite de recalculer à chaque render
const svgCache: Record<string, string> = {}

// Calcule les dimensions d'un marqueur goutte pour une taille donnée
export function getTearParams(selected: boolean, promoted: boolean, isMax: boolean) {
  const r       = isMax ? 10 : selected ? 9 : (promoted ? 8 : 7)
  const tailH   = Math.round(r * 1.0)
  const starH   = isMax ? 11 : 0   // hauteur réservée pour l'étoile au-dessus
  const pad     = 3
  const w       = r * 2 + pad * 2
  const h       = r * 2 + tailH + pad * 2 + starH
  const cx      = w / 2
  const cy      = pad + starH + r   // centre du cercle
  const tipY    = cy + r + tailH    // pointe en bas
  const holeR   = Math.max(2, Math.round(r * 0.30))
  return { r, tailH, starH, pad, w, h, cx, cy, tipY, holeR }
}

export function getProducerTearParams(selected: boolean, isMax: boolean) {
  const r       = selected ? 10 : isMax ? 9 : 7
  const tailH   = Math.round(r * 1.0)
  const pad     = 3
  const w       = r * 2 + pad * 2
  const h       = r * 2 + tailH + pad * 2
  const cx      = w / 2
  const cy      = pad + r
  const tipY    = cy + r + tailH
  const holeR   = Math.max(2, Math.round(r * 0.30))
  return { r, tailH, pad, w, h, cx, cy, tipY, holeR }
}

// Trace la forme goutte: cercle en haut, pointe en bas
export function tearPath(r: number, cx: number, cy: number, tipY: number): string {
  const tailH = tipY - cy - r
  const cpX   = r * 0.32
  const cpY   = tailH * 0.40
  return `M${cx},${tipY} C${cx-cpX},${tipY-cpY} ${cx-r},${cy+r*0.5} ${cx-r},${cy} A${r},${r} 0 1 1 ${cx+r},${cy} C${cx+r},${cy+r*0.5} ${cx+cpX},${tipY-cpY} ${cx},${tipY} Z`
}

export function producerMarkerSvg(selected: boolean, isMax: boolean): string {
  const key = `producer|${selected}|${isMax}`
  if (svgCache[key]) return svgCache[key]
  const p    = getProducerTearParams(selected, isMax)
  const path = tearPath(p.r, p.cx, p.cy, p.tipY)
  const fill = isMax ? '#E8622A' : '#2D5A3D'
  const glow    = selected ? `<ellipse cx="${p.cx}" cy="${p.cy}" rx="${p.r+4}" ry="${p.r+3}" fill="${fill}" opacity="0.16"/>` : ''
  const maxHalo = isMax && !selected ? `<ellipse cx="${p.cx}" cy="${p.cy}" rx="${p.r+4}" ry="${p.r+3}" fill="${fill}" opacity="0.13"/>` : ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${p.w}" height="${p.h}">
    ${maxHalo}${glow}
    <path d="${path}" fill="${fill}" fill-opacity="0.88" stroke="rgba(255,255,255,0.88)" stroke-width="${selected?2:1.2}"/>
    <circle cx="${p.cx}" cy="${p.cy}" r="${p.holeR}" fill="white" opacity="0.55"/>
  </svg>`
  const url = `data:image/svg+xml,${encodeURIComponent(svg)}`
  svgCache[key] = url
  return url
}

export function markerSvg(categorie: string, selected: boolean, approx = false, promoted = false, isMax = false): string {
  const key = `${categorie}|${selected}|${approx}|${promoted}|${isMax}`
  if (svgCache[key]) return svgCache[key]
  const url = _buildMarkerSvg(categorie, selected, approx, promoted, isMax)
  svgCache[key] = url
  return url
}

function _buildMarkerSvg(categorie: string, selected: boolean, approx = false, promoted = false, isMax = false): string {
  const cat  = CATEGORIES[categorie as keyof typeof CATEGORIES] ?? CATEGORIES.autre
  const p    = getTearParams(selected, promoted, isMax)
  const path = tearPath(p.r, p.cx, p.cy, p.tipY)

  const fillColor   = approx ? '#BBBBBB' : cat.color
  const fillOpacity = approx ? 0.52 : selected ? 0.94 : 0.82
  const strokeColor = 'rgba(255,255,255,0.88)'
  const strokeW     = selected ? 2 : 1.2
  const dashAttr    = approx ? `stroke-dasharray="2 1.5"` : ''

  const glow = selected
    ? `<ellipse cx="${p.cx}" cy="${p.cy}" rx="${p.r+4}" ry="${p.r+3}" fill="${fillColor}" opacity="0.18"/>`
    : ''
  const maxHalo = isMax && !selected
    ? `<ellipse cx="${p.cx}" cy="${p.cy}" rx="${p.r+4}" ry="${p.r+3}" fill="#EC407A" opacity="0.14"/>`
    : ''
  const star = isMax && p.starH > 0
    ? `<text x="${p.cx}" y="${p.starH - 1}" text-anchor="middle" dominant-baseline="auto" font-size="10" fill="#EC407A" opacity="0.92" font-family="sans-serif">✦</text>`
    : ''

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${p.w}" height="${p.h}">
    ${maxHalo}${glow}
    <path d="${path}" fill="${fillColor}" fill-opacity="${fillOpacity}" stroke="${strokeColor}" stroke-width="${strokeW}" ${dashAttr}/>
    <circle cx="${p.cx}" cy="${p.cy}" r="${p.holeR}" fill="white" opacity="0.52"/>
    ${star}
  </svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
