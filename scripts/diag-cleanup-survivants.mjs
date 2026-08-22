// Diag READ-ONLY : pourquoi certains événements passés survivent-ils au cleanup ?
// Reproduit EXACTEMENT le critère de /api/admin/cleanup (sans rien supprimer).
// Run: cd la-place-du-village && node --env-file=.env.local scripts/diag-cleanup-survivants.mjs

import { createClient } from '@supabase/supabase-js'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

// Même calcul de cutoff que la route (J-2, heure serveur)
const now = new Date()
const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2)
const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`

console.log(`\ncutoff du cleanup (J-2) : ${cutoffStr}`)

// Ce que le cleanup supprimerait s'il tournait maintenant
const { data: cibles } = await db
  .from('evenements')
  .select('id, titre, date_debut, date_fin, statut, source')
  .or(`date_fin.lt.${cutoffStr},and(date_fin.is.null,date_debut.lt.${cutoffStr})`)

console.log(`\n=== Le cleanup supprimerait MAINTENANT : ${cibles?.length ?? 0} événements ===`)
const parStatut = {}
for (const e of cibles ?? []) parStatut[e.statut] = (parStatut[e.statut] ?? 0) + 1
for (const [s, n] of Object.entries(parStatut)) console.log(`  ${s.padEnd(12)} ${n}`)
for (const e of (cibles ?? []).slice(0, 10)) {
  console.log(`  ${e.date_debut} → ${e.date_fin ?? '∅'}  [${e.statut}] "${(e.titre ?? '').slice(0, 45)}"`)
}

// Les vieux qui SURVIVENT : date_debut ancienne mais date_fin qui les protège
const { data: survivants } = await db
  .from('evenements')
  .select('titre, date_debut, date_fin, statut, source')
  .lt('date_debut', cutoffStr)
  .not('date_fin', 'is', null)
  .gte('date_fin', cutoffStr)
  .order('date_debut', { ascending: true })
  .limit(15)

console.log(`\n=== Vieux events PROTÉGÉS par une date_fin future : ${survivants?.length ?? 0} ===`)
for (const e of survivants ?? []) {
  console.log(`  début ${e.date_debut} → fin ${e.date_fin}  [${e.statut}] ${(e.source ?? '?').padEnd(9)} "${(e.titre ?? '').slice(0, 45)}"`)
}
