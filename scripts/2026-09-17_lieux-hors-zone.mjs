/**
 * LES LIEUX POSÉS À L'AUTRE BOUT DU MONDE.
 *
 * Google, interrogé sans repère géographique, rendait l'homonyme le plus
 * célèbre plutôt que le voisin : un atelier vélo annoncé à Lasalle — 17 km de
 * Ganges — pointait sur un commerce de Dour, en Belgique, à 719 km, avec un
 * identifiant parfaitement valide. Un « Antirouille » finissait au Québec, un
 * « Golf de Casiac » en Italie.
 *
 * La cause est réparée des deux côtés : la recherche penche désormais vers
 * Ganges, et le contrôle de zone s'applique enfin à la route des collecteurs.
 * Ce script nettoie ce qui est déjà entré.
 *
 * IL NE SUPPRIME RIEN. Il DÉTACHE : l'événement perd ses coordonnées fausses
 * et redevient un rendez-vous sans lieu résolu — visible, éditable, corrigeable
 * à la main. Effacer la fiche ferait disparaître une information réelle à
 * cause d'une erreur de géocodage ; la détacher rend seulement la punaise à
 * son incertitude.
 *
 *   node scripts/2026-09-17_lieux-hors-zone.mjs              → à blanc
 *   node scripts/2026-09-17_lieux-hors-zone.mjs --appliquer  → écrit
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = fs.readFileSync('.env.local', 'utf8')
const val = (k) => { const m = env.match(new RegExp('^' + k + '=(.*)$', 'm')); return m ? m[1].trim().replace(/^["']|["']$/g, '') : null }
const db = createClient(val('NEXT_PUBLIC_SUPABASE_URL'), val('SUPABASE_SERVICE_KEY'))

const APPLIQUER = process.argv.includes('--appliquer')

const hav = (a, b, x, y) => {
  const R = 6371, t = d => d * Math.PI / 180
  const dLat = t(x - a), dLon = t(y - b)
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(t(a)) * Math.cos(t(x)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(q))
}

// La zone réelle, lue en base — pas une valeur recopiée ici.
const [{ data: centres }, { data: cfg }] = await Promise.all([
  db.from('zone_centres').select('nom, lat, lng'),
  db.from('config').select('value').eq('key', 'rayon_insertion_km').single(),
])
const rayon = parseInt(cfg?.value ?? '100', 10)
if (!centres?.length) { console.error('aucun centre de zone : on ne peut rien mesurer'); process.exit(1) }
console.log(`zone : ${centres.map(c => c.nom).join(', ')} — rayon d'insertion ${rayon} km\n`)

const { data: lieux } = await db.from('lieux')
  .select('id, nom, commune, adresse, lat, lng').not('lat', 'is', null).limit(3000)

const distance = l => Math.min(...centres.map(c => hav(c.lat, c.lng, l.lat, l.lng)))
const loin = (lieux ?? []).map(l => ({ ...l, d: distance(l) })).filter(l => l.d > rayon)

console.log(`lieux hors zone : ${loin.length} sur ${lieux.length}`)
for (const l of loin.sort((a, b) => b.d - a.d)) {
  console.log(`  ${l.d.toFixed(0).padStart(5)} km  « ${(l.nom ?? '').slice(0, 34).padEnd(36)} » commune=${l.commune ?? '—'}`)
  console.log(`              ${(l.adresse ?? '(pas d adresse)').slice(0, 74)}`)
}

const ids = loin.map(l => l.id)
const evs = []
for (let i = 0; i < ids.length; i += 100) {
  const { data } = await db.from('evenements')
    .select('id, titre, statut, source, date_debut').in('lieu_id', ids.slice(i, i + 100))
  evs.push(...(data ?? []))
}
console.log(`\névénements rattachés à ces lieux : ${evs.length}`)
for (const e of evs) console.log(`  [${(e.source ?? '?').padEnd(10)}] ${e.statut.padEnd(10)} ${e.date_debut ?? '—'}  ${e.titre.slice(0, 48)}`)

if (!APPLIQUER) {
  console.log('\nÀ BLANC — rien écrit. Relancer avec --appliquer.')
  console.log('Effet : les événements perdront ce lieu (rien n’est supprimé), et les lieux fautifs seront effacés.')
  process.exit(0)
}

// 1. Détacher les événements — ils restent, sans lieu.
let detaches = 0
for (let i = 0; i < ids.length; i += 100) {
  const { error, count } = await db.from('evenements')
    .update({ lieu_id: null }, { count: 'exact' })
    .in('lieu_id', ids.slice(i, i + 100))
  if (error) { console.error('détachement :', error.message); continue }
  detaches += count ?? 0
}

// 2. Effacer les lieux fautifs — plus rien ne les utilise, et les laisser
//    reviendrait à les proposer de nouveau à la prochaine extraction.
let effaces = 0
for (let i = 0; i < ids.length; i += 100) {
  const { error, count } = await db.from('lieux')
    .delete({ count: 'exact' }).in('id', ids.slice(i, i + 100))
  if (error) { console.error('suppression :', error.message); continue }
  effaces += count ?? 0
}

console.log(`\n${detaches} événement(s) détaché(s), ${effaces} lieu(x) effacé(s).`)
console.log('Aucun événement supprimé : ils sont à corriger à la main dans le back-office.')
