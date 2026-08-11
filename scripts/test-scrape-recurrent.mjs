// Test À BLANC du pipeline récurrent, hors application.
// Ne touche NI la base NI la prod : lit la page, appelle le modèle, géocode,
// et affiche ce qui serait créé. Sert à valider le prompt avant de brancher.
//
// Run: cd la-place-du-village && node --env-file=.env.local scripts/test-scrape-recurrent.mjs "<url>"

import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'node:fs'

const URL_CIBLE = process.argv[2] ?? 'https://cevinside.fr/marches-cevennes/'
const RAYON_KM = 50
const HORIZON = 42
const GANGES = { lat: 43.9333, lng: 3.7075 }

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Le prompt est lu depuis le fichier de migration → on teste EXACTEMENT ce qui
// sera en base, pas une copie qui pourrait diverger.
const sql = readFileSync(new URL('./2026-08-11_scrape_recurrent.sql', import.meta.url), 'utf8')
const PROMPT = sql.split('$PROMPT$')[1]
if (!PROMPT) { console.error('Prompt introuvable dans le SQL'); process.exit(1) }

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

const aujourdhui = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())

function ajouteJours(d, n) { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
function jourDe(d) { return JOURS[new Date(d + 'T12:00:00Z').getUTCDay()] }
function dansLaPeriode(d, debut, fin) {
  if (!debut || !fin) return true
  const mmdd = d.slice(5)
  return debut <= fin ? (mmdd >= debut && mmdd <= fin) : (mmdd >= debut || mmdd <= fin)
}
function occurrences(r) {
  if (r.regulier === false) return []
  const tous = (r.jour ?? '').toLowerCase() === 'tous_les_jours'
  if (!tous && !JOURS.includes((r.jour ?? '').toLowerCase())) return []
  const out = []
  for (let i = 0; i < HORIZON; i++) {
    const d = ajouteJours(aujourdhui, i)
    if (!tous && jourDe(d) !== (r.jour ?? '').toLowerCase()) continue
    if (!dansLaPeriode(d, r.periode_debut, r.periode_fin)) continue
    out.push(d)
  }
  return out
}
function haversineKm(a, b, c, d) {
  const R = 6371, p = Math.PI / 180
  const dp = (c - a) * p, dl = (d - b) * p
  const x = Math.sin(dp / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin(dl / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}
const INDICE_GEO = 'Cévennes, France'
async function geocode(nom, commune) {
  const q = [nom, commune, INDICE_GEO].filter(Boolean).join(', ')
  const u = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&key=${process.env.GOOGLE_PLACES_KEY}`
  const r = await fetch(u).then(x => x.json()).catch(() => null)
  const p = r?.results?.[0]
  return p ? { lat: p.geometry?.location?.lat, lng: p.geometry?.location?.lng } : null
}
async function mapLimit(items, limite, fn) {
  const out = new Array(items.length); let i = 0
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]) }
  }))
  return out
}

// ── 1. La page ────────────────────────────────────────────────────────────────
console.log(`\nPage : ${URL_CIBLE}`)
const pageText = (await fetch(`https://r.jina.ai/${URL_CIBLE}`, {
  headers: { Accept: 'text/plain', 'X-No-Cache': 'true' },
}).then(r => r.text())).slice(0, 40000)
console.log(`Texte récupéré : ${pageText.length} caractères${pageText.length >= 40000 ? '  ⚠️ TRONQUÉ À 40 000' : ''}`)

// ── 2. Le modèle ──────────────────────────────────────────────────────────────
const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const t0 = Date.now()
const resp = await anthropic.messages.create({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 16384,
  temperature: 0,
  system: PROMPT.replaceAll('{{today}}', today),
  messages: [{ role: 'user', content: `Source : ${URL_CIBLE}\n\n${pageText}` }],
})
const raw = resp.content[0].type === 'text' ? resp.content[0].text : '[]'
let regles = []
try { regles = JSON.parse(raw.replace(/^```json?\s*/i, '').replace(/```\s*$/, '')) } catch (e) { console.error('JSON illisible:', raw.slice(0, 400)); process.exit(1) }
console.log(`Modèle : ${regles.length} règles en ${((Date.now() - t0) / 1000).toFixed(1)} s`)
console.log(`Tokens : ${resp.usage.input_tokens} in / ${resp.usage.output_tokens} out`)

// ── 3. Contrôles de cohérence ─────────────────────────────────────────────────
const cles = regles.map(r => r.cle)
const dupCles = cles.filter((c, i) => cles.indexOf(c) !== i)
const sansJour = regles.filter(r => !JOURS.includes((r.jour ?? '').toLowerCase()) && r.jour !== 'tous_les_jours')
const irregulieres = regles.filter(r => r.regulier === false)
const saisonnieres = regles.filter(r => r.periode_debut)

console.log(`\n── Contrôles ──`)
console.log(`  clés en double        : ${dupCles.length}${dupCles.length ? '  → ' + [...new Set(dupCles)].join(', ') : ''}`)
console.log(`  jour non reconnu      : ${sansJour.length}${sansJour.length ? '  → ' + sansJour.map(r => `${r.cle}(${r.jour})`).join(', ') : ''}`)
console.log(`  récurrences irrégulières : ${irregulieres.length}`)
console.log(`  saisonnières          : ${saisonnieres.length}`)

// Recopie textuelle de la source ? On cherche les descriptions dont une longue
// suite de mots apparaît telle quelle dans la page.
const pageNorm = pageText.toLowerCase().replace(/\s+/g, ' ')
const copies = regles.filter(r => {
  const d = (r.description ?? '').toLowerCase().replace(/\s+/g, ' ')
  if (d.length < 30) return false
  for (let i = 0; i + 40 <= d.length; i += 10) if (pageNorm.includes(d.slice(i, i + 40))) return true
  return false
})
console.log(`  descriptions recopiées de la source : ${copies.length}${copies.length ? '  ⚠️' : '  ✓'}`)
for (const c of copies.slice(0, 5)) console.log(`     ⚠️ ${c.cle} — "${c.description.slice(0, 70)}…"`)

// ── 4. Zone + occurrences ─────────────────────────────────────────────────────
console.log(`\n── Géocodage (rayon ${RAYON_KM} km autour de Ganges) ──`)
const geos = await mapLimit(regles, 5, r => geocode(r.lieu_nom, r.commune))

const retenues = [], horsZone = [], sansLieu = []
let totalDates = 0
for (let i = 0; i < regles.length; i++) {
  const r = regles[i], g = geos[i]
  if (r.regulier === false) continue
  if (!g?.lat) { sansLieu.push(r); continue }
  const km = Math.round(haversineKm(GANGES.lat, GANGES.lng, g.lat, g.lng))
  r._km = km
  if (km > RAYON_KM) { horsZone.push(r); continue }
  r._dates = occurrences(r)
  totalDates += r._dates.length
  retenues.push(r)
}

console.log(`  retenus     : ${retenues.length}`)
console.log(`  hors zone   : ${horsZone.length}`)
console.log(`  lieu inconnu: ${sansLieu.length}`)
console.log(`  à la main   : ${irregulieres.length}`)
console.log(`\n  ➜ ${totalDates} dates seraient créées sur ${HORIZON} jours`)

console.log(`\n── LES ${retenues.length} RETENUS ──`)
for (const r of retenues.sort((a, b) => JOURS.indexOf(a.jour) - JOURS.indexOf(b.jour))) {
  console.log(`\n  ${r.titre}   [${r.jour} ${r.heure ?? '—'}]  ${r._km} km  ${r.periode_texte ? `(${r.periode_texte})` : ''}`)
  console.log(`     ${r.description ?? '(pas de description)'}`)
  console.log(`     clé: ${r.cle}  ·  ${r._dates.length} dates : ${r._dates.slice(0, 4).join(', ')}${r._dates.length > 4 ? '…' : ''}`)
}

if (irregulieres.length) {
  console.log(`\n── À TRAITER À LA MAIN (${irregulieres.length}) ──`)
  for (const r of irregulieres) console.log(`  ${r.titre} — ${r.note_irreguliere ?? '?'}`)
}
if (sansLieu.length) {
  console.log(`\n── LIEU INTROUVABLE (${sansLieu.length}) ──`)
  for (const r of sansLieu) console.log(`  ${r.titre} (${r.commune ?? '?'} / ${r.lieu_nom ?? '—'})`)
}
console.log(`\n── HORS ZONE (${horsZone.length}) : ${horsZone.map(r => `${r.commune} ${r._km}km`).slice(0, 20).join(', ')}${horsZone.length > 20 ? '…' : ''}`)
