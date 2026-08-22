// Diag : reproduit l'INSERT feedback de /api/feedback en direct via service role
// pour identifier la vraie cause du 500 "Erreur enregistrement".
// Run: cd la-place-du-village && node --env-file=.env.local scripts/test-feedback-insert.mjs

import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
)

// 1. Récupérer un event id valide (n'importe lequel)
const { data: sample, error: sampleErr } = await supabaseAdmin
  .from('evenements')
  .select('id, titre')
  .limit(1)
  .maybeSingle()

if (sampleErr) { console.error('SELECT event err:', sampleErr); process.exit(1) }
if (!sample) { console.error('Aucun event en DB pour tester'); process.exit(1) }

console.log('Event de test:', sample.id, '-', sample.titre)

// 2. Tenter l'INSERT exact comme /api/feedback
const payload = {
  evenement_id:    sample.id,
  evenement_titre: sample.titre?.slice(0, 200) ?? null,
  message:         'Test diag feedback insert — peut être supprimé.',
  contact:         'test@example.com',
}
console.log('\nPayload INSERT:', JSON.stringify(payload, null, 2))

const { data, error } = await supabaseAdmin
  .from('feedbacks')
  .insert(payload)
  .select()

if (error) {
  console.error('\n❌ INSERT a échoué :')
  console.error('  message:', error.message)
  console.error('  code:', error.code)
  console.error('  details:', error.details)
  console.error('  hint:', error.hint)
  process.exit(1)
}

console.log('\n✅ INSERT OK. Row créée:', JSON.stringify(data, null, 2))

// 3. Cleanup : supprimer le test
if (data && data.length > 0) {
  const { error: delErr } = await supabaseAdmin
    .from('feedbacks')
    .delete()
    .eq('id', data[0].id)
  if (delErr) console.error('Cleanup err:', delErr.message)
  else console.log('Test feedback supprimé.')
}
