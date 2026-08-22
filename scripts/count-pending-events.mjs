// Diag : compte les events 'en_attente' selon leur publish_at pour mesurer
// l'impact d'activer le cron /api/cron/publish.
// Run: cd la-place-du-village && node --env-file=.env.local scripts/count-pending-events.mjs

import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
)

const now = new Date().toISOString()

// 1. Events qui se publieraient IMMEDIATEMENT au prochain tick cron
//    (mêmes critères que le cron: publish_at <= now AND statut=en_attente AND publish_at NOT NULL)
const { count: immediate, error: err1 } = await supabaseAdmin
  .from('evenements')
  .select('id', { count: 'exact', head: true })
  .eq('statut', 'en_attente')
  .not('publish_at', 'is', null)
  .lte('publish_at', now)

// 2. Events programmes pour publication FUTURE (publish_at > now)
const { count: future, error: err2 } = await supabaseAdmin
  .from('evenements')
  .select('id', { count: 'exact', head: true })
  .eq('statut', 'en_attente')
  .not('publish_at', 'is', null)
  .gt('publish_at', now)

// 3. Events en_attente SANS publish_at (ne seront PAS publies par le cron)
//    Typiquement: collector whatsapp/signal, scraper, admin manuel
const { count: noPublishAt, error: err3 } = await supabaseAdmin
  .from('evenements')
  .select('id', { count: 'exact', head: true })
  .eq('statut', 'en_attente')
  .is('publish_at', null)

// 4. Sur les immediates : combien ont submitted_by (= notifs qui partiraient)
const { count: immediateWithNotif, error: err4 } = await supabaseAdmin
  .from('evenements')
  .select('id', { count: 'exact', head: true })
  .eq('statut', 'en_attente')
  .not('publish_at', 'is', null)
  .lte('publish_at', now)
  .not('submitted_by', 'is', null)

// 5. Echantillon des 10 plus anciens immediates pour comprendre
const { data: samples } = await supabaseAdmin
  .from('evenements')
  .select('id, titre, date_debut, publish_at, submitted_by, submitted_by_name, source, created_at')
  .eq('statut', 'en_attente')
  .not('publish_at', 'is', null)
  .lte('publish_at', now)
  .order('publish_at', { ascending: true })
  .limit(10)

if (err1 || err2 || err3 || err4) {
  console.error('Erreurs:', { err1, err2, err3, err4 })
  process.exit(1)
}

console.log(`\n=== DIAG CRON /api/cron/publish (au ${now}) ===\n`)
console.log(`Events 'en_attente' avec publish_at <= now (publication IMMEDIATE au 1er tick): ${immediate}`)
console.log(`  └─ dont avec submitted_by (notifs qui partiraient)                          : ${immediateWithNotif}`)
console.log(`Events 'en_attente' avec publish_at > now  (publication FUTURE programmee)    : ${future}`)
console.log(`Events 'en_attente' avec publish_at IS NULL (ne seront PAS touches par le cron): ${noPublishAt}`)
console.log(`\nTotal events 'en_attente' tous criteres confondus: ${immediate + future + noPublishAt}\n`)

if (samples && samples.length > 0) {
  console.log(`=== 10 plus anciens parmi les ${immediate} immediats ===`)
  for (const s of samples) {
    const ageDays = Math.floor((Date.now() - new Date(s.publish_at).getTime()) / 86400000)
    console.log(`  [${s.source.padEnd(11)}] ${s.publish_at.slice(0, 16)} (J-${ageDays}) - ${s.submitted_by_name || '(no user)'} - "${s.titre?.slice(0, 50) || '(no titre)'}"`)
  }
}
