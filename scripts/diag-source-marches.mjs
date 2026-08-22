// Lecture seule : état de la source récurrente + preuve qu'aucun marché n'a été écrit.
// Run: cd la-place-du-village && node --env-file=.env.local scripts/diag-source-marches.mjs

import { createClient } from '@supabase/supabase-js'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

const { data: sources } = await db
  .from('sources')
  .select('id, nom, url, type, actif, rayon_km, horizon_jours, indice_geo, publier_auto, frequence, dernier_scrape, created_at')
  .order('created_at', { ascending: false })

console.log('\n=== SOURCES ===')
for (const s of sources ?? []) {
  console.log(`\n  ${s.nom}   [${s.type}]   ${s.actif ? 'actif' : 'inactif'}`)
  console.log(`    ${s.url}`)
  if (s.type === 'recurrent') {
    console.log(`    rayon ${s.rayon_km ?? '(global)'} km · horizon ${s.horizon_jours ?? 42} j · indice "${s.indice_geo ?? '(France)'}" · publier_auto ${s.publier_auto}`)
  }
  console.log(`    dernier_scrape : ${s.dernier_scrape ?? 'jamais'}`)
}

// Un aperçu n'écrit rien : ni série, ni log. On le vérifie.
const { count: series } = await db
  .from('evenements').select('id', { count: 'exact', head: true }).not('serie_cle', 'is', null)
console.log(`\n=== Événements portant une serie_cle : ${series ?? 0} ===`)
console.log('   (0 attendu tant que tu n\'as pas lancé le vrai scrape)')

const { data: logs } = await db
  .from('scrape_logs').select('created_at, trouves, doublons, inseres, erreur')
  .order('created_at', { ascending: false }).limit(3)
console.log('\n=== 3 derniers logs de scrape ===')
for (const l of logs ?? []) {
  console.log(`  ${l.created_at.slice(0, 16)}  trouves=${l.trouves} doublons=${l.doublons} inseres=${l.inseres}${l.erreur ? ' ERREUR: ' + l.erreur : ''}`)
}
console.log('   (l\'aperçu ne journalise rien : aucune ligne nouvelle attendue)')
