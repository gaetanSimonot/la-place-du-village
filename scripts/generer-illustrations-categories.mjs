/**
 * Illustrations de repli par catégorie d'événement.
 *
 * À jouer une fois : `node scripts/generer-illustrations-categories.mjs`
 * Produit les fichiers de public/categories/ que `imageEvenement()` sert
 * quand un événement n'a pas d'affiche.
 *
 * POURQUOI DES FICHIERS, ET PAS UN DÉGRADÉ EN CSS : `imageEvenement()` rend
 * une URL, et sept composants s'en servent — de la carte au splash. Passer
 * par un fichier statique, comme le fait déjà le marché, laisse ces sept
 * appelants inchangés. Un SVG en ligne aurait demandé de tous les toucher,
 * et `next/image` refuse les SVG par défaut.
 *
 * Le dessin est volontairement abstrait : un motif, jamais une scène. Une
 * photo générique de concert ferait croire à une photo DU concert — c'est
 * précisément ce qu'on veut éviter. Ici, on lit un pictogramme.
 */
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'

const DOSSIER = path.join(process.cwd(), 'public', 'categories')
const L = 600, H = 400

/** Couleurs de `src/lib/categories.ts`, adoucies pour un fond. */
const CATEGORIES = {
  concert:         { c: '#E74C3C', motif: 'ondes' },
  theatre:         { c: '#9B59B6', motif: 'rideau' },
  sport:           { c: '#27AE60', motif: 'cercles' },
  atelier:         { c: '#3498DB', motif: 'grille' },
  fete:            { c: '#E91E63', motif: 'confettis' },
  sante_bien_etre: { c: '#16A085', motif: 'vagues' },
  autre:           { c: '#95A5A6', motif: 'grille' },
}

/** Éclaircit une couleur vers le blanc — pour un fond qui ne crie pas. */
function clair(hex, f) {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  const m = v => Math.round(v + (255 - v) * f)
  return `rgb(${m(r)},${m(g)},${m(b)})`
}

function motifSvg(nom, c) {
  const t = (o) => `stroke="${c}" stroke-opacity="${o}" fill="none"`
  if (nom === 'ondes') {
    return [0.9, 0.7, 0.5, 0.35].map((o, i) =>
      `<path d="M-20 ${150 + i * 55} Q 90 ${100 + i * 55} 200 ${150 + i * 55} T 420 ${150 + i * 55} T 640 ${150 + i * 55}" ${t(o * 0.22)} stroke-width="14" stroke-linecap="round"/>`).join('')
  }
  if (nom === 'rideau') {
    return Array.from({ length: 9 }, (_, i) =>
      `<path d="M${30 + i * 70} -10 Q ${55 + i * 70} 200 ${30 + i * 70} 410" ${t(0.16)} stroke-width="20" stroke-linecap="round"/>`).join('')
  }
  if (nom === 'cercles') {
    return [[150, 200, 120], [420, 140, 90], [340, 320, 70], [70, 60, 55]]
      .map(([x, y, r], i) => `<circle cx="${x}" cy="${y}" r="${r}" ${t(0.2 - i * 0.03)} stroke-width="12"/>`).join('')
  }
  if (nom === 'confettis') {
    const pts = [[80, 90, 18], [200, 50, 12], [330, 120, 22], [470, 70, 14], [520, 230, 18],
                 [120, 250, 16], [260, 300, 20], [400, 340, 12], [60, 350, 14], [560, 130, 10]]
    return pts.map(([x, y, r], i) =>
      `<rect x="${x}" y="${y}" width="${r * 2}" height="${r}" rx="${r / 3}" transform="rotate(${i * 37} ${x} ${y})" fill="${c}" fill-opacity="0.18"/>`).join('')
  }
  if (nom === 'vagues') {
    return [0, 1, 2].map(i =>
      `<path d="M-20 ${120 + i * 90} C 120 ${60 + i * 90}, 240 ${180 + i * 90}, 380 ${120 + i * 90} S 620 ${60 + i * 90}, 640 ${120 + i * 90}" ${t(0.18)} stroke-width="16" stroke-linecap="round"/>`).join('')
  }
  // grille
  return [
    ...Array.from({ length: 7 }, (_, i) => `<line x1="${i * 100}" y1="0" x2="${i * 100}" y2="400" ${t(0.13)} stroke-width="8"/>`),
    ...Array.from({ length: 5 }, (_, i) => `<line x1="0" y1="${i * 100}" x2="600" y2="${i * 100}" ${t(0.13)} stroke-width="8"/>`),
  ].join('')
}

fs.mkdirSync(DOSSIER, { recursive: true })

for (const [nom, { c, motif }] of Object.entries(CATEGORIES)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${H}" viewBox="0 0 ${L} ${H}">
  <defs>
    <linearGradient id="f" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${clair(c, 0.86)}"/>
      <stop offset="100%" stop-color="${clair(c, 0.68)}"/>
    </linearGradient>
  </defs>
  <rect width="${L}" height="${H}" fill="url(#f)"/>
  ${motifSvg(motif, c)}
</svg>`
  const sortie = path.join(DOSSIER, `${nom}.webp`)
  await sharp(Buffer.from(svg)).webp({ quality: 88 }).toFile(sortie)
  console.log(`  ${nom.padEnd(16)} → ${path.relative(process.cwd(), sortie)}`)
}
console.log('\nFait. Les illustrations sont servies par imageEvenement().')
