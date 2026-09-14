/**
 * RATTRAPAGE — donner leurs jours aux rendez-vous qui reviennent.
 *
 * Depuis le 03/09/2026, un planning hebdomadaire tient dans UNE fiche couvrant
 * toute sa periode. Le jour reel n'existait qu'en toutes lettres dans la
 * description, donc « Atelier clown, tous les jeudis » s'affichait aussi le
 * lundi. La colonne `jours_semaine` le rend lisible ; ce script la remplit
 * pour l'existant.
 *
 * POURQUOI CLAUDE ET PAS UNE RECHERCHE DE MOT : « Exposition Nicole Dufour »
 * cite « vendredi 4 septembre » pour son vernissage et precise « ouvert tous
 * les jours ». Une regex sur « vendredi » la ferait disparaitre six jours sur
 * sept. Il faut comprendre la phrase, pas la scanner.
 *
 * Ne touche QUE les evenements longs (> 7 jours) encore en cours ou a venir :
 * un evenement d'un seul jour n'a pas de recurrence, et le passe n'interesse
 * personne.
 *
 *   node scripts/2026-09-14_backfill-jours-semaine.mjs          (simulation)
 *   node scripts/2026-09-14_backfill-jours-semaine.mjs --ecrire (applique)
 */
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'

const ECRIRE = process.argv.includes('--ecrire')

const env = fs.readFileSync('.env.local', 'utf8')
const val = (k) => {
  const m = env.match(new RegExp('^' + k + '=(.*)$', 'm'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null
}
const db = createClient(val('NEXT_PUBLIC_SUPABASE_URL'), val('SUPABASE_SERVICE_KEY'))
const anthropic = new Anthropic({ apiKey: val('ANTHROPIC_API_KEY') })

const JOURS_INSTALLE = 7
const aujourdhui = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())

const duree = (e) => {
  if (!e.date_debut || !e.date_fin || e.date_fin === e.date_debut) return 0
  return Math.round((Date.parse(e.date_fin + 'T12:00:00Z') - Date.parse(e.date_debut + 'T12:00:00Z')) / 86_400_000)
}

const SYSTEME = `Tu lis la fiche d'un evenement local et tu dis QUELS JOURS DE LA SEMAINE il a reellement lieu.

Reponds UNIQUEMENT par un JSON : {"jours": [...], "pourquoi": "..."}
- "jours" : tableau d'entiers, 1 = lundi ... 7 = dimanche.
- null si l'evenement vaut TOUS les jours de sa periode.
- "pourquoi" : cinq mots maximum, la phrase qui t'a decide.

Regles :
- "tous les jeudis" -> [4]
- une grille de creneaux -> tous les jours qui portent au moins un creneau
- une exposition "ouverte tous les jours" -> null, MEME si un jour est cite pour le vernissage : le vernissage n'est pas le rythme de l'exposition
- "du lundi au vendredi" -> [1,2,3,4,5]
- si rien n'indique un rythme hebdomadaire -> null

Dans le doute, null : mieux vaut un evenement visible un jour de trop qu'un rendez-vous introuvable le jour ou il a lieu.`

const NOMS = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

function nettoyer(v) {
  if (!Array.isArray(v)) return null
  const j = Array.from(new Set(v.map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 7))).sort((a, b) => a - b)
  return j.length ? j : null
}

async function lireJours(e) {
  const r = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    temperature: 0,
    system: SYSTEME,
    messages: [{
      role: 'user',
      content: JSON.stringify({
        titre: e.titre,
        du: e.date_debut, au: e.date_fin,
        heure: e.heure,
        description: (e.description ?? '').slice(0, 1500),
      }),
    }],
  })
  const brut = r.content[0].type === 'text' ? r.content[0].text : '{}'
  const m = brut.match(/\{[\s\S]*\}/)
  if (!m) return { jours: null, pourquoi: 'reponse illisible' }
  try {
    const o = JSON.parse(m[0])
    return { jours: nettoyer(o.jours), pourquoi: String(o.pourquoi ?? '').slice(0, 40) }
  } catch {
    return { jours: null, pourquoi: 'reponse illisible' }
  }
}

// ── Les candidats : longs, encore d'actualite, et pas deja renseignes ────────
let tous = [], page = 0
for (;;) {
  const { data, error } = await db.from('evenements')
    .select('id, titre, description, date_debut, date_fin, heure, jours_semaine, statut')
    .not('statut', 'in', '("archive","rejete")')
    .not('date_fin', 'is', null)
    .gte('date_fin', aujourdhui)
    .order('id').range(page * 1000, page * 1000 + 999)
  if (error) { console.error('Lecture impossible :', error.message); process.exit(1) }
  if (!data?.length) break
  tous.push(...data)
  if (data.length < 1000) break
  page++
}

const candidats = tous.filter(e => duree(e) > JOURS_INSTALLE && !e.jours_semaine)
console.log(`${ECRIRE ? 'ECRITURE' : 'SIMULATION (ajouter --ecrire pour appliquer)'}`)
console.log(`${candidats.length} evenement(s) a examiner.\n`)

let avecJours = 0, sansJours = 0, echecs = 0
for (const [i, e] of candidats.entries()) {
  let r
  try {
    r = await lireJours(e)
  } catch (err) {
    echecs++
    console.log(`  !! ${e.titre.slice(0, 44)} — ${err.message}`)
    continue
  }

  const libelle = r.jours ? r.jours.map(j => NOMS[j]).join(', ') : 'tous les jours'
  if (r.jours) avecJours++; else sansJours++
  console.log(`${String(i + 1).padStart(3)}/${candidats.length}  ${e.titre.slice(0, 40).padEnd(42)} -> ${libelle.padEnd(34)} (${r.pourquoi})`)

  if (ECRIRE && r.jours) {
    const { error } = await db.from('evenements').update({ jours_semaine: r.jours }).eq('id', e.id)
    if (error) { echecs++; console.log(`       ECHEC ecriture : ${error.message}`) }
  }
}

console.log(`\n${avecJours} avec des jours precis, ${sansJours} laisses a « tous les jours », ${echecs} echec(s).`)
if (!ECRIRE) console.log('Rien n a ete ecrit. Relancer avec --ecrire.')
