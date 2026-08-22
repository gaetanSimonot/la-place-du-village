// Diag READ-ONLY : les événements passés s'accumulent-ils en base ?
// Run: cd la-place-du-village && node --env-file=.env.local scripts/diag-events-passes.mjs

import { createClient } from '@supabase/supabase-js'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())

const { count: total } = await db.from('evenements').select('id', { count: 'exact', head: true })

// Passés = date_fin < today, ou (pas de date_fin et date_debut < today)
const { count: passes } = await db
  .from('evenements')
  .select('id', { count: 'exact', head: true })
  .or(`date_fin.lt.${today},and(date_fin.is.null,date_debut.lt.${today})`)

const { data: plusVieux } = await db
  .from('evenements')
  .select('titre, date_debut, statut, source, created_at')
  .not('date_debut', 'is', null)
  .order('date_debut', { ascending: true })
  .limit(5)

console.log(`\nAujourd'hui (Paris) : ${today}`)
console.log(`Total événements en base : ${total}`)
console.log(`Dont passés            : ${passes}  (${Math.round((passes / total) * 100)} %)`)

console.log('\n-- les 5 plus anciens encore en base --')
for (const e of plusVieux ?? []) {
  console.log(`  ${e.date_debut}  [${(e.statut ?? '?').padEnd(10)}] ${(e.source ?? '?').padEnd(9)} "${(e.titre ?? '').slice(0, 50)}"`)
}

// Répartition par année de date_debut
const { data: all } = await db.from('evenements').select('date_debut').not('date_debut', 'is', null)
const parAn = {}
for (const e of all ?? []) {
  const an = e.date_debut.slice(0, 7)
  parAn[an] = (parAn[an] ?? 0) + 1
}
console.log('\n-- répartition par mois --')
for (const [an, n] of Object.entries(parAn).sort()) {
  console.log(`  ${an}  ${'█'.repeat(Math.min(50, n))} ${n}`)
}

const { count: lieuxTotal } = await db.from('lieux').select('id', { count: 'exact', head: true })
console.log(`\nTotal lieux en base : ${lieuxTotal}`)
