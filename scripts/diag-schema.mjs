// Diag READ-ONLY : colonnes réelles de prompts_ia / sources / evenements.
// Run: cd la-place-du-village && node --env-file=.env.local scripts/diag-schema.mjs

import { createClient } from '@supabase/supabase-js'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

for (const table of ['prompts_ia', 'sources', 'evenements', 'lieux']) {
  const { data, error } = await db.from(table).select('*').limit(1)
  console.log(`\n=== ${table} ===`)
  if (error) { console.log('  erreur:', error.message); continue }
  if (!data?.length) { console.log('  (table vide)'); continue }
  for (const [k, v] of Object.entries(data[0])) {
    const t = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v
    const preview = typeof v === 'string' ? ` — "${v.slice(0, 40).replace(/\n/g, ' ')}"` : ''
    console.log(`  ${k.padEnd(22)} ${t}${preview}`)
  }
}

// Les prompts existants (ids seulement)
const { data: prompts } = await db.from('prompts_ia').select('id, nom').order('id')
console.log('\n=== prompts_ia existants ===')
for (const p of prompts ?? []) console.log(`  ${String(p.id).padEnd(22)} ${p.nom ?? ''}`)
