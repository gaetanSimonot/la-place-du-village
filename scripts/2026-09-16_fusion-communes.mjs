/**
 * UNE COMMUNE, UNE ÉCRITURE.
 *
 * Mesuré le 16/09/2026 : 221 graphies distinctes pour une soixantaine de
 * communes réelles. Saint-Hippolyte-du-Fort s'écrivait à lui seul de cinq
 * façons. Pour l'app c'étaient cinq endroits : cinq entrées de filtre, cinq
 * compteurs, et une recherche qui en trouve un sur cinq.
 *
 * Ce script ne touche QUE le libellé de la commune. Aucune coordonnée, aucun
 * rattachement, aucune fiche n'est fusionnée : deux lieux distincts d'un même
 * village restent deux lieux. On corrige une orthographe, rien d'autre.
 *
 * IL NE RAPPROCHE QUE CE QUI EST IDENTIQUE UNE FOIS NORMALISÉ. « Saint
 * Hippolyte des Fleurs » n'est pas « Saint-Hippolyte-du-Fort », et
 * « Ganges / St Hippolyte du Fort » désigne deux communes : les deux restent
 * intacts. Deviner qu'il s'agit d'une faute serait fusionner deux villages sur
 * une intuition.
 *
 *   node scripts/2026-09-16_fusion-communes.mjs              → à blanc
 *   node scripts/2026-09-16_fusion-communes.mjs --appliquer  → écrit
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import jitiPkg from 'jiti'

const jiti = (jitiPkg.createJiti ?? jitiPkg)(path.join(process.cwd(), 'scripts/x.js'), {
  alias: { '@': path.join(process.cwd(), 'src') }, interopDefault: true,
})
const { cleCommune, meilleureGraphie } =
  jiti.import ? await jiti.import('@/lib/communes') : jiti('@/lib/communes')

const env = fs.readFileSync('.env.local', 'utf8')
const val = (k) => { const m = env.match(new RegExp('^' + k + '=(.*)$', 'm')); return m ? m[1].trim().replace(/^["']|["']$/g, '') : null }
const db = createClient(val('NEXT_PUBLIC_SUPABASE_URL'), val('SUPABASE_SERVICE_KEY'))

const APPLIQUER = process.argv.includes('--appliquer')
const TABLES = ['lieux', 'etablissements']

// ── 1. Recenser toutes les graphies, table par table ─────────────────────
const parCle = new Map()   // cle -> Map(graphie -> nombre d'occurrences)

for (const t of TABLES) {
  let de = 0
  for (;;) {
    const { data, error } = await db.from(t).select('id, commune')
      .not('commune', 'is', null).range(de, de + 999)
    if (error) { console.error(`${t} :`, error.message); process.exit(1) }
    if (!data?.length) break
    for (const r of data) {
      const brut = String(r.commune).trim()
      if (!brut) continue
      const cle = cleCommune(brut)
      if (!cle) continue
      if (!parCle.has(cle)) parCle.set(cle, new Map())
      const m = parCle.get(cle)
      m.set(brut, (m.get(brut) ?? 0) + 1)
    }
    if (data.length < 1000) break
    de += 1000
  }
}

// ── 2. Pour chaque clé, élire la graphie et lister les perdantes ─────────
const aCorriger = []            // { de, vers, occurrences }
let graphiesTotal = 0

for (const [, formes] of parCle) {
  graphiesTotal += formes.size
  if (formes.size < 2) continue
  const gagnante = meilleureGraphie([...formes.keys()])
  for (const [forme, n] of formes) {
    if (forme !== gagnante) aCorriger.push({ de: forme, vers: gagnante, occurrences: n })
  }
}

console.log(`graphies distinctes            : ${graphiesTotal}`)
console.log(`communes réelles (clés)        : ${parCle.size}`)
console.log(`graphies à corriger            : ${aCorriger.length}`)
console.log(`lignes concernées              : ${aCorriger.reduce((n, c) => n + c.occurrences, 0)}\n`)

const parCible = new Map()
for (const c of aCorriger) {
  if (!parCible.has(c.vers)) parCible.set(c.vers, [])
  parCible.get(c.vers).push(c)
}
for (const [vers, liste] of [...parCible].sort((a, b) => b[1].length - a[1].length).slice(0, 25)) {
  console.log(`  ${vers}`)
  for (const c of liste) console.log(`      ← « ${c.de} »  (${c.occurrences})`)
}
if (parCible.size > 25) console.log(`  … et ${parCible.size - 25} autres communes`)

// ── 3. Écrire ────────────────────────────────────────────────────────────
if (!APPLIQUER) {
  console.log('\nÀ BLANC — rien n’a été écrit. Relancer avec --appliquer.')
  process.exit(0)
}

let ecrites = 0
for (const c of aCorriger) {
  for (const t of TABLES) {
    // `eq` et non `ilike` : on remplace exactement la graphie recensée, pas
    // une famille de graphies. Deux passes valent mieux qu'un filtre trop
    // large sur une écriture en production.
    const { error, count } = await db.from(t)
      .update({ commune: c.vers }, { count: 'exact' })
      .eq('commune', c.de)
    if (error) { console.error(`  ${t} « ${c.de} » :`, error.message); continue }
    ecrites += count ?? 0
  }
}
console.log(`\n${ecrites} ligne(s) réécrite(s).`)
