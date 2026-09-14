/**
 * CONVERSION — d'une règle hebdomadaire vers des dates réelles.
 *
 * `jours_semaine`, posé le matin du 14/09, disait « le jeudi ». Utile, mais
 * une règle ne sait pas dire « tous les jeudis SAUF le 25 décembre », ni
 * décrire les Puces de Ganges — six samedis entre juin et octobre, ce qui
 * n'est aucun rythme. Ce script matérialise la règle : chaque événement qui
 * porte des jours reçoit la LISTE des dates où il a réellement lieu.
 *
 * `jours_semaine` n'est pas effacé pour autant : il devient le paramètre de
 * génération, ce qu'on rejoue pour prolonger une saison.
 *
 * L'HISTORIQUE EST CONSERVÉ : la génération part de `date_debut`, même
 * passée. Un atelier garde la trace des fois où il a eu lieu ; seul
 * l'affichage ne montre que l'avenir.
 *
 *   node scripts/2026-09-14_convertir-jours-en-dates.mjs          (simulation)
 *   node scripts/2026-09-14_convertir-jours-en-dates.mjs --ecrire (applique)
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const ECRIRE = process.argv.includes('--ecrire')

const env = fs.readFileSync('.env.local', 'utf8')
const val = (k) => {
  const m = env.match(new RegExp('^' + k + '=(.*)$', 'm'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null
}
const db = createClient(val('NEXT_PUBLIC_SUPABASE_URL'), val('SUPABASE_SERVICE_KEY'))

// Copie fidèle de src/lib/occurrences.ts — un script jetable n'importe pas du TS.
const JOUR_MS = 86_400_000
const MAX_DATES = 400
const instant = (y) => Date.parse(`${y}T12:00:00Z`)
const ymd = (t) => new Date(t).toISOString().slice(0, 10)
const jourISO = (d) => { const j = new Date(`${d}T12:00:00Z`).getUTCDay(); return j === 0 ? 7 : j }
const estUneDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(instant(v))

function engendrerDates(debut, fin, jours = []) {
  if (!estUneDate(debut) || !estUneDate(fin)) return []
  const t1 = instant(debut), t2 = instant(fin)
  if (t2 < t1) return []
  const voulus = new Set(jours.filter(j => Number.isInteger(j) && j >= 1 && j <= 7))
  const out = []
  for (let t = t1; t <= t2 && out.length < MAX_DATES; t += JOUR_MS) {
    const d = ymd(t)
    if (!voulus.size || voulus.has(jourISO(d))) out.push(d)
  }
  return out
}

const NOMS = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
const aujourdhui = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())

// ── Les candidats : une règle posée, pas encore de dates ─────────────────────
let tous = [], page = 0
for (;;) {
  const { data, error } = await db.from('evenements')
    .select('id, titre, date_debut, date_fin, jours_semaine, dates, statut')
    .not('statut', 'in', '("archive","rejete")')
    .not('jours_semaine', 'is', null)
    .order('id').range(page * 1000, page * 1000 + 999)
  if (error) { console.error('Lecture impossible :', error.message); process.exit(1) }
  if (!data?.length) break
  tous.push(...data)
  if (data.length < 1000) break
  page++
}

const candidats = tous.filter(e => !e.dates?.length)
console.log(ECRIRE ? 'ECRITURE' : 'SIMULATION (ajouter --ecrire pour appliquer)')
console.log(`${candidats.length} evenement(s) a convertir.\n`)

let faits = 0, vides = 0, echecs = 0
for (const e of candidats) {
  const dates = engendrerDates(e.date_debut, e.date_fin ?? e.date_debut, e.jours_semaine)
  const aVenir = dates.filter(d => d >= aujourdhui).length
  const libelle = e.jours_semaine.map(j => NOMS[j]).join(', ')

  if (!dates.length) {
    vides++
    console.log(`  --  ${e.titre.slice(0, 42).padEnd(44)} ${libelle.padEnd(28)} aucune date (periode vide ?)`)
    continue
  }

  console.log(`  ok  ${e.titre.slice(0, 42).padEnd(44)} ${libelle.padEnd(28)} ${String(dates.length).padStart(3)} dates, dont ${aVenir} a venir`)

  if (ECRIRE) {
    // date_debut / date_fin suivent la liste : toute la selection SQL du
    // projet s'appuie dessus.
    const { error } = await db.from('evenements')
      .update({ dates, date_debut: dates[0], date_fin: dates[dates.length - 1] })
      .eq('id', e.id)
    if (error) { echecs++; console.log(`      ECHEC : ${error.message}`) }
    else faits++
  }
}

console.log(`\n${ECRIRE ? faits + ' converti(s)' : candidats.length - vides + ' convertible(s)'}, ${vides} sans date, ${echecs} echec(s).`)
if (!ECRIRE) console.log('Rien n a ete ecrit. Relancer avec --ecrire.')
