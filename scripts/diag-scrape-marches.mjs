// Diag READ-ONLY : que vient de produire le scrape "marchés" ?
// N'écrit rien. Run:
//   cd la-place-du-village && node --env-file=.env.local scripts/diag-scrape-marches.mjs

import { createClient } from '@supabase/supabase-js'

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
)

// ── 1. Les derniers runs de scrape ────────────────────────────────────────────
const { data: logs } = await db
  .from('scrape_logs')
  .select('id, source_id, created_at, trouves, doublons, inseres, erreur')
  .order('created_at', { ascending: false })
  .limit(8)

const { data: sources } = await db.from('sources').select('id, nom, url, dernier_scrape')
const srcName = Object.fromEntries((sources ?? []).map(s => [s.id, s.nom]))

console.log('\n=== DERNIERS RUNS DE SCRAPE ===')
for (const l of logs ?? []) {
  console.log(
    `  ${l.created_at.slice(0, 16)} | ${(srcName[l.source_id] ?? '?').slice(0, 28).padEnd(28)}` +
    ` | trouves=${String(l.trouves).padStart(3)} doublons=${String(l.doublons).padStart(3)}` +
    ` inseres=${String(l.inseres).padStart(3)}${l.erreur ? ` | ERREUR: ${l.erreur}` : ''}`,
  )
}

// ── 2. Les events créés par ce scrape (48 dernières heures) ───────────────────
const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString()

const { data: evts } = await db
  .from('evenements')
  .select('id, titre, date_debut, date_fin, heure, categorie, categories, statut, lieu_id, description, source, scrape_source_id, created_at, publish_at')
  .eq('source', 'scrape')
  .gte('created_at', since)
  .order('created_at', { ascending: true })

console.log(`\n=== EVENTS source='scrape' créés depuis 48 h : ${evts?.length ?? 0} ===`)

if (!evts?.length) {
  console.log('  (rien — le scrape a peut-être écrit sous une autre source)')
  process.exit(0)
}

// Répartition par statut
const parStatut = {}
for (const e of evts) parStatut[e.statut] = (parStatut[e.statut] ?? 0) + 1
console.log('\n-- par statut --')
for (const [s, n] of Object.entries(parStatut).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${s.padEnd(12)} ${n}`)
}

// Répartition par catégorie
const parCat = {}
for (const e of evts) parCat[e.categorie] = (parCat[e.categorie] ?? 0) + 1
console.log('\n-- par catégorie --')
for (const [c, n] of Object.entries(parCat).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${(c ?? 'null').padEnd(18)} ${n}`)
}

// Qualité des dates
const sansDate = evts.filter(e => !e.date_debut).length
const avecFin  = evts.filter(e => e.date_fin && e.date_fin !== e.date_debut).length
const sansLieu = evts.filter(e => !e.lieu_id).length
const sansHeure = evts.filter(e => !e.heure).length
console.log('\n-- qualité --')
console.log(`  sans date_debut : ${sansDate}`)
console.log(`  avec date_fin ≠ date_debut (multi-jours) : ${avecFin}`)
console.log(`  sans lieu_id : ${sansLieu}`)
console.log(`  sans heure   : ${sansHeure}`)

// Étalement des dates
const dates = evts.map(e => e.date_debut).filter(Boolean).sort()
if (dates.length) {
  const uniq = [...new Set(dates)]
  console.log(`  plage de dates : ${dates[0]} → ${dates[dates.length - 1]} (${uniq.length} dates distinctes)`)
}

// Doublons de titre
const parTitre = {}
for (const e of evts) {
  const k = (e.titre ?? '').trim().toLowerCase()
  ;(parTitre[k] ??= []).push(e)
}
const repetes = Object.entries(parTitre).filter(([, v]) => v.length > 1).sort((a, b) => b[1].length - a[1].length)
console.log(`\n-- titres répétés : ${repetes.length} titres pour ${repetes.reduce((s, [, v]) => s + v.length, 0)} lignes --`)
for (const [t, v] of repetes.slice(0, 15)) {
  console.log(`  ×${String(v.length).padStart(2)}  "${t.slice(0, 60)}"  dates: ${v.map(e => e.date_debut ?? '∅').slice(0, 6).join(', ')}${v.length > 6 ? '…' : ''}`)
}

// Échantillon brut
console.log('\n-- 15 premiers, tels quels --')
for (const e of evts.slice(0, 15)) {
  console.log(`  [${e.statut.padEnd(10)}] ${(e.date_debut ?? '∅').padEnd(10)} ${(e.heure ?? '—').toString().slice(0, 5).padEnd(5)} ${(e.categorie ?? '?').padEnd(16)} "${(e.titre ?? '').slice(0, 55)}"`)
  if (e.description) console.log(`               ↳ ${e.description.slice(0, 110).replace(/\n/g, ' ')}`)
}

// ── 3. Lieux créés dans la foulée ─────────────────────────────────────────────
const { data: lieux } = await db
  .from('lieux')
  .select('id, nom, commune, lat, lng, place_id_google, created_at')
  .gte('created_at', since)
  .order('created_at', { ascending: true })

console.log(`\n=== LIEUX créés depuis 48 h : ${lieux?.length ?? 0} ===`)
if (lieux?.length) {
  const parPlace = {}
  for (const l of lieux) {
    const k = l.place_id_google ?? `nom:${(l.nom ?? '').toLowerCase()}`
    ;(parPlace[k] ??= []).push(l)
  }
  const dups = Object.entries(parPlace).filter(([, v]) => v.length > 1)
  console.log(`  lieux physiques distincts : ${Object.keys(parPlace).length}`)
  console.log(`  dont créés en plusieurs exemplaires : ${dups.length}`)
  for (const [, v] of dups.slice(0, 10)) {
    console.log(`    ×${v.length}  ${v[0].nom} (${v[0].commune ?? '—'})`)
  }
}
