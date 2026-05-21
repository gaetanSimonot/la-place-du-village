// One-shot cleanup : supprime l'event de test "Soirée concert 2099"
// cree pendant la validation du fix RLS (branche fix/api-extract-rls).
// Run: cd la-place-du-village && node --env-file=.env.local scripts/cleanup-test-event.mjs

import { createClient } from '@supabase/supabase-js'

const EVENT_ID = '490bd47b-ee72-47e9-802f-d46caf8eb811'
const LIEU_ID  = 'be157941-dbfe-494f-9b43-6f6a65d582de'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
)

const { data: before, error: readErr } = await supabaseAdmin
  .from('evenements')
  .select('id, titre, date_debut, statut, source, lieu_id, created_at')
  .eq('id', EVENT_ID)
  .maybeSingle()

if (readErr) { console.error('Erreur lecture event:', readErr.message); process.exit(1) }
if (!before) { console.log('Event introuvable (deja supprime ?)'); process.exit(0) }
console.log('Event trouve:', JSON.stringify(before, null, 2))

const { error: delEvtErr } = await supabaseAdmin.from('evenements').delete().eq('id', EVENT_ID)
if (delEvtErr) { console.error('Erreur DELETE event:', delEvtErr.message); process.exit(1) }
console.log('Event supprime.')

const { count, error: countErr } = await supabaseAdmin
  .from('evenements')
  .select('id', { count: 'exact', head: true })
  .eq('lieu_id', LIEU_ID)

if (countErr) { console.error('Erreur count refs lieu:', countErr.message); process.exit(1) }
console.log(`Refs restantes sur le lieu: ${count}`)

if (count === 0) {
  const { error: delLieuErr } = await supabaseAdmin.from('lieux').delete().eq('id', LIEU_ID)
  if (delLieuErr) { console.error('Erreur DELETE lieu:', delLieuErr.message); process.exit(1) }
  console.log('Lieu orphelin supprime.')
} else {
  console.log('Lieu garde (encore reference).')
}
console.log('Cleanup termine.')
