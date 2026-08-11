// Le biais par paramètre d'API ne marche pas. On teste l'indice DANS la requête.
// Lecture seule. Run: node --env-file=.env.local scripts/test-geocode-indice.mjs

const G = { lat: 43.9333, lng: 3.7075 }
const CAS = [
  [null, 'Bréau'], [null, 'Saint-Martial'], [null, 'Rochegude'], ['Ste Claire', null],
  [null, 'Sumène'], [null, 'Ganges'], [null, 'Le Vigan'], ['Place des Halles', 'Ganges'],
  [null, 'Alès'], [null, 'Florac'], [null, 'Valleraugue'], [null, 'Les Plantiers'],
]

const SUFFIXES = {
  'France':            'France',
  'Cévennes, France':  'Cévennes, France',
  'Gard, France':      'Gard, France',
  'Occitanie, France': 'Occitanie, France',
}

function km(lat, lng) {
  const R = 6371, p = Math.PI / 180
  const dp = (lat - G.lat) * p, dl = (lng - G.lng) * p
  const x = Math.sin(dp / 2) ** 2 + Math.cos(G.lat * p) * Math.cos(lat * p) * Math.sin(dl / 2) ** 2
  return Math.round(2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)))
}

async function geo(nom, commune, suffixe) {
  const q = [nom, commune, suffixe].filter(Boolean).join(', ')
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&key=${process.env.GOOGLE_PLACES_KEY}`
  const r = await fetch(url).then(x => x.json()).catch(() => null)
  const p = r?.results?.[0]
  if (!p?.geometry?.location) return '∅'
  return km(p.geometry.location.lat, p.geometry.location.lng)
}

const noms = Object.keys(SUFFIXES)
console.log(`\n  ${'requête'.padEnd(26)}${noms.map(n => n.padStart(19)).join('')}`)
console.log('  ' + '─'.repeat(26 + 19 * noms.length))
for (const [nom, commune] of CAS) {
  const label = [nom, commune].filter(Boolean).join(', ')
  const res = []
  for (const n of noms) res.push(await geo(nom, commune, SUFFIXES[n]))
  console.log(`  ${label.padEnd(26)}${res.map(r => String(typeof r === 'number' ? r + ' km' : r).padStart(19)).join('')}`)
}
