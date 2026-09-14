/**
 * RATTRAPAGE — relire l'affiche ET le message, comme l'extraction l'a fait.
 *
 * Le rattrapage du matin ne lisait que le titre et la description, et il est
 * passé à côté. « Kundalini Yoga — Asso ALIBI » en est l'exemple : sa
 * description parle de la pratique — « un yoga dynamique, subtil et joyeux » —
 * et pas une fois du lundi. Le « lundis 18h-19h30 » n'est QUE sur l'affiche.
 * Le modèle a répondu « aucun rythme spécifié » en toute honnêteté : il
 * regardait au mauvais endroit.
 *
 * Or l'événement a été créé À PARTIR de deux choses : l'affiche et le texte du
 * message du collecteur. Les deux sont encore là — l'image dans le stockage,
 * le message dans `messages_entrants`. On rejoue donc les mêmes conditions,
 * et l'une rattrape ce que l'autre tait : beaucoup de messages WhatsApp sont
 * vides de texte et tout tient dans l'image, l'inverse existe aussi.
 *
 * Ne touche QUE les événements longs, encore d'actualité, qui n'ont ni dates
 * ni jours — on ne défait rien de ce qui a déjà été décidé.
 *
 *   node scripts/2026-09-14_relire-affiches-pour-dates.mjs          (simulation)
 *   node scripts/2026-09-14_relire-affiches-pour-dates.mjs --ecrire (applique)
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

// ── Copie fidèle de src/lib/occurrences.ts ──────────────────────────────────
const JOUR_MS = 86_400_000, MAX_DATES = 400
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
const JOURS_INSTALLE = 7
const aujourdhui = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())
const duree = (e) => {
  if (!e.date_debut || !e.date_fin || e.date_fin === e.date_debut) return 0
  return Math.round((instant(e.date_fin) - instant(e.date_debut)) / JOUR_MS)
}

const SYSTEME = `Tu regardes l'affiche d'un evenement local et le message qui l'accompagnait, et tu dis QUELS JOURS DE LA SEMAINE il a lieu.

Reponds UNIQUEMENT par un JSON : {"jours": [...], "dates": [...], "ou": "...", "pourquoi": "..."}
- "dates" : si l'affiche ENUMERE des dates precises ("Ven 2, Sam 3, Mar 6"), donne-les au format AAAA-MM-JJ. C'est le cas le plus sur : une liste de dates ne s'interprete pas. null sinon.
- "jours" : sinon, le RYTHME hebdomadaire — tableau d'entiers, 1 = lundi ... 7 = dimanche. null si l'evenement vaut TOUS les jours de sa periode.
- "ou" : "affiche", "texte" ou "aucun" — la ou tu as trouve l'information.
- "pourquoi" : la phrase ou la ligne exacte qui t'a decide, dix mots maximum.

COHERENCE : les jours que tu donnes doivent correspondre a ceux que cite ton "pourquoi". Si l'affiche annonce des creneaux le mardi ET le vendredi, donne les DEUX.

REGARDE L'AFFICHE EN PRIORITE : les horaires d'un cours y figurent presque toujours, souvent sous forme de grille, alors que la description ne parle que du contenu de la pratique.

Regles :
- "les lundis 18h-19h30" -> [1]
- une grille de creneaux -> tous les jours qui portent au moins un creneau
- "du lundi au vendredi" -> [1,2,3,4,5]
- une exposition "ouverte tous les jours" -> null, MEME si un jour est cite pour le vernissage : le vernissage n'est pas le rythme de l'exposition
- un evenement sur des dates precises consecutives (festival de trois jours) -> null
- si rien n'indique un rythme hebdomadaire -> null

Dans le doute, null : mieux vaut un evenement visible un jour de trop qu'un rendez-vous introuvable le jour ou il a lieu.`

function nettoyerJours(v) {
  if (!Array.isArray(v)) return null
  const j = Array.from(new Set(v.map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 7))).sort((a, b) => a - b)
  return j.length ? j : null
}

/** L'affiche, telle que l'extraction l'avait vue. */
async function chargerImage(url) {
  if (!url) return null
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length > 4_500_000) return null            // limite de l'API
    const mime = url.toLowerCase().endsWith('.png') ? 'image/png'
      : url.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/jpeg'
    return { data: buf.toString('base64'), mime }
  } catch { return null }
}

async function lireJours(e, message, image) {
  const texte = [
    `Titre : ${e.titre}`,
    `Periode : du ${e.date_debut} au ${e.date_fin}`,
    e.heure ? `Heure enregistree : ${e.heure}` : null,
    e.description ? `Description :\n${e.description.slice(0, 1200)}` : null,
    message ? `\nMessage d'origine du collecteur :\n${message.slice(0, 1200)}` : null,
  ].filter(Boolean).join('\n')

  const content = image
    ? [{ type: 'text', text: texte },
       { type: 'image', source: { type: 'base64', media_type: image.mime, data: image.data } }]
    : texte

  const r = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 250,
    temperature: 0,
    system: SYSTEME,
    messages: [{ role: 'user', content }],
  })
  const brut = r.content[0].type === 'text' ? r.content[0].text : '{}'
  const m = brut.match(/\{[\s\S]*\}/)
  if (!m) return { jours: null, datesDites: null, ou: 'aucun', pourquoi: 'reponse illisible' }
  try {
    const o = JSON.parse(m[0])
    const datesDites = Array.isArray(o.dates)
      ? Array.from(new Set(o.dates.filter(estUneDate))).sort()
      : null
    return {
      jours: nettoyerJours(o.jours),
      datesDites: datesDites?.length ? datesDites : null,
      ou: String(o.ou ?? '?'),
      pourquoi: String(o.pourquoi ?? '').slice(0, 46),
    }
  } catch { return { jours: null, datesDites: null, ou: 'aucun', pourquoi: 'reponse illisible' } }
}

// ── Les candidats ───────────────────────────────────────────────────────────
let tous = [], page = 0
for (;;) {
  const { data, error } = await db.from('evenements')
    .select('id, titre, description, date_debut, date_fin, heure, jours_semaine, dates, image_url, message_entrant_id, statut')
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

const candidats = tous.filter(e => duree(e) > JOURS_INSTALLE && !e.dates?.length && !e.jours_semaine?.length)
console.log(ECRIRE ? 'ECRITURE' : 'SIMULATION (ajouter --ecrire pour appliquer)')
console.log(`${candidats.length} evenement(s) a relire — affiche + message d'origine.\n`)

let trouves = 0, sansRythme = 0, echecs = 0, incoherents = 0
for (const [i, e] of candidats.entries()) {
  // Le texte exact que le collecteur avait envoye.
  let message = null
  if (e.message_entrant_id) {
    const { data: m } = await db.from('messages_entrants')
      .select('contenu').eq('id', e.message_entrant_id).maybeSingle()
    message = m?.contenu ?? null
  }
  const image = await chargerImage(e.image_url)

  let r
  try { r = await lireJours(e, message, image) }
  catch (err) { echecs++; console.log(`  !! ${e.titre.slice(0, 40)} — ${err.message}`); continue }

  const sources = [image ? 'affiche' : null, message ? 'texte' : null].filter(Boolean).join('+') || 'rien'
  const num = `${String(i + 1).padStart(3)}/${candidats.length}`

  /*
   * LE JUSTIFICATIF DOIT CONCORDER AVEC LA REPONSE.
   *
   * Trois cas relevés en simulation citaient un jour absent des jours retenus
   * — « Mardi 18h15 » pour une reponse « mercredi, vendredi ». Une affiche qui
   * liste plusieurs lieux avec des horaires differents se lit mal, et le
   * modele en oublie un. On ne tranche pas a sa place : ces cas partent en
   * revue manuelle plutot qu'en base.
   */
  const citesDansLeTexte = NOMS
    .map((nom, n) => ({ nom, n }))
    .filter(j => j.nom && r.pourquoi.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(j.nom))
    .map(j => j.n)
  const oublies = r.jours ? citesDansLeTexte.filter(n => !r.jours.includes(n)) : []
  if (oublies.length && !r.datesDites) {
    incoherents++
    console.log(`${num} ??  ${e.titre.slice(0, 38).padEnd(40)} [${sources.padEnd(13)}] INCOHERENT — repond ${r.jours.map(j => NOMS[j]).join(',')} mais cite ${oublies.map(n => NOMS[n]).join(',')} : « ${r.pourquoi} »`)
    continue
  }

  if (!r.jours && !r.datesDites) {
    sansRythme++
    console.log(`${num} --  ${e.titre.slice(0, 38).padEnd(40)} [${sources.padEnd(13)}] tous les jours   (${r.pourquoi})`)
    continue
  }

  /*
   * UNE SEULE DATE POUR UN EVENEMENT LONG : C'EST UN DETAIL, PAS LE TOUT.
   *
   * Releve en simulation : « Chemins de Traverses », festival d'avril a
   * octobre, revenait avec la seule date d'un concert de mai ; le concours
   * photo, avec la seule remise des prix. Les reduire a cette date les ferait
   * DISPARAITRE de l'agenda — l'inverse de ce qu'on cherche. Au-dela d'un
   * mois, une liste d'une seule date est une erreur de lecture.
   */
  if (r.datesDites && r.datesDites.length === 1 && duree(e) > 30) {
    incoherents++
    console.log(`${num} ??  ${e.titre.slice(0, 38).padEnd(40)} [${sources.padEnd(13)}] UNE SEULE DATE sur ${duree(e)} jours — probable detail : « ${r.pourquoi} »`)
    continue
  }

  // Une liste de dates ne s'interprete pas : elle prime sur toute regle.
  const dates = r.datesDites ?? engendrerDates(e.date_debut, e.date_fin, r.jours)
  const aVenir = dates.filter(d => d >= aujourdhui).length
  trouves++
  console.log(`${num} OK  ${e.titre.slice(0, 38).padEnd(40)} [${sources.padEnd(13)}] ${(r.jours ? r.jours.map(j => NOMS[j]).join(', ') : 'dates listees').padEnd(26)} ${dates.length} dates (${aVenir} a venir) — vu dans l'${r.ou} : ${r.pourquoi}`)

  if (ECRIRE && dates.length) {
    const { error } = await db.from('evenements').update({
      jours_semaine: r.jours ?? null,
      dates,
      date_debut: dates[0],
      date_fin: dates[dates.length - 1],
    }).eq('id', e.id)
    if (error) { echecs++; console.log(`        ECHEC ecriture : ${error.message}`) }
  }
}

console.log(`\n${trouves} avec un rythme trouve, ${sansRythme} sans, ${incoherents} incoherent(s) laisse(s) de cote, ${echecs} echec(s).`)
if (!ECRIRE) console.log('Rien n a ete ecrit. Relancer avec --ecrire.')
