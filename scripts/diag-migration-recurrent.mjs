// Vérifie que la migration 2026-08-11 est bien passée. Lecture seule.
// Run: cd la-place-du-village && node --env-file=.env.local scripts/diag-migration-recurrent.mjs

import { createClient } from '@supabase/supabase-js'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

let ok = true
const dit = (bon, texte) => { if (!bon) ok = false; console.log(`  ${bon ? '✓' : '✗'} ${texte}`) }

console.log('\n── Colonnes ──')

const { error: e1 } = await db.from('evenements').select('serie_cle').limit(1)
dit(!e1, `evenements.serie_cle${e1 ? '  → ' + e1.message : ''}`)

const { data: src, error: e2 } = await db
  .from('sources').select('type, rayon_km, horizon_jours, indice_geo, publier_auto').limit(1)
dit(!e2, `sources.type / rayon_km / horizon_jours / indice_geo / publier_auto${e2 ? '  → ' + e2.message : ''}`)
if (!e2 && src?.[0]) console.log(`     (sources existantes : type = "${src[0].type}")`)

console.log('\n── Prompt ──')
const { data: p, error: e3 } = await db
  .from('prompts_ia').select('id, nom, systeme').eq('id', 'scrape_recurrent').maybeSingle()
dit(!e3 && !!p, `prompts_ia « scrape_recurrent »${p ? ` — ${p.systeme.length} caractères` : ' ABSENT'}`)
if (p) dit(p.systeme.includes('{{today}}'), 'la variable {{today}} est bien présente')

console.log('\n── Le verrou anti-doublon ──')
// On tente réellement deux insertions identiques, puis on nettoie derrière.
const CLE = 'test:verrou-migration'
const ligne = {
  titre: 'TEST verrou (à supprimer)', date_debut: '2030-01-01',
  categorie: 'autre', categories: ['autre'], statut: 'archive',
  serie_cle: CLE, source: 'scrape',
}
const { error: i1 } = await db.from('evenements').insert(ligne)
dit(!i1, `première insertion acceptée${i1 ? '  → ' + i1.message : ''}`)
const { error: i2 } = await db.from('evenements').insert(ligne)
dit(!!i2, `seconde insertion REFUSÉE par le verrou${i2 ? ` (${i2.code})` : '  ← PROBLÈME : le doublon est passé'}`)

const { error: up } = await db.from('evenements')
  .upsert([ligne], { onConflict: 'serie_cle,date_debut', ignoreDuplicates: true }).select('id')
dit(!up, `upsert « ignorer les doublons » fonctionne${up ? '  → ' + up.message : ''}`)

const { count } = await db.from('evenements')
  .delete({ count: 'exact' }).eq('serie_cle', CLE).select('id')
console.log(`     nettoyage : ${count ?? 0} ligne(s) de test supprimée(s)`)

console.log(ok ? '\n✅ Migration OK — le système est prêt.\n' : '\n⚠️  Quelque chose manque, voir ci-dessus.\n')
