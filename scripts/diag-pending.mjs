// Diag READ-ONLY : combien d'events restent "à traiter", et d'où viennent-ils ?
// Run: cd la-place-du-village && node --env-file=.env.local scripts/diag-pending.mjs

import { createClient } from '@supabase/supabase-js'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

for (const st of ['en_attente', 'a_verifier', 'archive', 'publie']) {
  const { count } = await db.from('evenements').select('id', { count: 'exact', head: true }).eq('statut', st)
  console.log(`${st.padEnd(12)} total = ${count}`)
}

const { data } = await db
  .from('evenements')
  .select('source, statut, categorie, created_at')
  .in('statut', ['en_attente', 'a_verifier'])

const m = {}
for (const e of data ?? []) {
  const k = `${e.statut} / ${e.source ?? 'null'} / ${e.categorie ?? '?'}`
  m[k] = (m[k] ?? 0) + 1
}
console.log('\n-- « à traiter » (en_attente + a_verifier), par source et catégorie --')
for (const [k, v] of Object.entries(m).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(4)}  ${k}`)
}
console.log(`\n  TOTAL à traiter : ${data?.length ?? 0}`)
