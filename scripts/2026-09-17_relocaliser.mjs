/**
 * RENDRE UN LIEU AUX ÉVÉNEMENTS QUI N'EN ONT PLUS.
 *
 * Deux populations, même remède. Ceux dont la punaise était fausse et qu'on
 * vient de détacher — Google rendait l'homonyme le plus célèbre faute de
 * repère. Et ceux qui n'ont jamais été situés du tout.
 *
 * On relit l'AFFICHE, pas seulement le titre : c'est elle qui porte la salle,
 * la rue, la commune. Puis on géocode avec le repère désormais posé sur
 * Ganges, et on vérifie la zone avant d'écrire.
 *
 * TROIS REFUS, et ils comptent autant que le reste :
 *   — le modèle ne nomme aucun lieu     → on laisse la fiche sans lieu
 *   — le géocodage ne trouve rien        → idem
 *   — le point tombe hors zone           → idem, on ne repose pas une erreur
 *
 * Mieux vaut un événement sans punaise qu'une punaise ailleurs : l'absence se
 * voit et se corrige, une fausse adresse se recopie et se propage.
 *
 * NE TOUCHE NI AU STATUT NI AU TEXTE. Seulement `lieu_id`.
 *
 *   node scripts/2026-09-17_relocaliser.mjs              → à blanc
 *   node scripts/2026-09-17_relocaliser.mjs --appliquer  → écrit
 */
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'
import path from 'path'
import jitiPkg from 'jiti'

const env = fs.readFileSync('.env.local', 'utf8')
for (const l of env.split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const val = (k) => process.env[k]

const jiti = (jitiPkg.createJiti ?? jitiPkg)(path.join(process.cwd(), 'scripts/x.js'), {
  alias: { '@': path.join(process.cwd(), 'src') }, interopDefault: true, cache: false,
})
const imp = async (m) => (jiti.import ? await jiti.import(m) : jiti(m))
const { geocodeWithGoogle } = await imp('@/lib/extract')
const { checkZone } = await imp('@/lib/checkZone')
const { trouverOuCreerLieu } = await imp('@/lib/lieuxResolve')

const db = createClient(val('NEXT_PUBLIC_SUPABASE_URL'), val('SUPABASE_SERVICE_KEY'))
const ai = new Anthropic({ apiKey: val('ANTHROPIC_API_KEY') })
const APPLIQUER = process.argv.includes('--appliquer')

const SYSTEME = `Tu lis l'affiche d'un événement local des Cévennes (Hérault 34 / Gard 30, autour de Ganges) et tu en extrais UNIQUEMENT le lieu.

Réponds par un JSON : {"lieu_nom": "…", "commune": "…", "adresse": "…"}

- "lieu_nom" : le nom de la salle, du bar, de la place, du domaine — tel qu'écrit. null si l'affiche n'en nomme aucun.
- "commune" : le village ou la ville. null si absente.
- "adresse" : la rue et le numéro si l'affiche les donne. null sinon.

N'INVENTE RIEN. Si l'affiche ne dit pas où ça se passe, réponds null partout — une fiche sans lieu vaut mieux qu'une fiche mal située, parce qu'on voit qu'il manque quelque chose au lieu de croire une adresse fausse.

LE TITRE PORTE PARFOIS LE LIEU, après un tiret : « Cabaret queer — La Tartine » se tient à La Tartine. Sers-t'en quand ce qui suit le tiret est manifestement un ENDROIT — un bar, une salle, une ferme, une filature. Jamais quand c'est un nom de personne (« — Frédéric Bertho »), un thème (« — Alimentation et micronutrition ») ou un sous-titre.

Et ne confonds pas un nom de lieu dans le titre avec une adresse : « Diane de Ganges » est le nom d'un spectacle, pas l'indication que ça se passe à Ganges.`

const { data: fiches } = await db
  .from('evenements')
  .select('id, titre, description, image_url, statut, source')
  .is('lieu_id', null)
  .not('statut', 'in', '("rejete","archive")')
  .order('created_at', { ascending: false })
  .limit(200)

console.log(`événements sans lieu à traiter : ${fiches?.length}`)
console.log(`   dont avec une affiche       : ${(fiches ?? []).filter(e => e.image_url).length}\n`)

if (!APPLIQUER) {
  for (const e of (fiches ?? []).slice(0, 25))
    console.log(`  ${e.image_url ? 'affiche' : '   -   '} ${e.statut.padEnd(11)} ${e.titre.slice(0, 56)}`)
  console.log('\nÀ BLANC — rien écrit. Relancer avec --appliquer.')
  process.exit(0)
}

let rattaches = 0, sansLieu = 0, horsZone = 0, echecs = 0

for (const [i, e] of (fiches ?? []).entries()) {
  const num = String(i + 1).padStart(3)
  try {
    const contenu = []
    if (e.image_url) {
      const r = await fetch(e.image_url)
      const buf = Buffer.from(await r.arrayBuffer())
      if (buf.length < 4_000_000) {
        contenu.push({ type: 'image', source: { type: 'base64',
          media_type: r.headers.get('content-type')?.includes('png') ? 'image/png' : 'image/jpeg',
          data: buf.toString('base64') } })
      }
    }
    contenu.push({ type: 'text', text: `Titre : ${e.titre}\nDescription : ${(e.description ?? '').slice(0, 600)}` })

    const rep = await ai.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 300, temperature: 0,
      system: SYSTEME, messages: [{ role: 'user', content: contenu }],
    })
    const brut = rep.content.find(c => c.type === 'text')?.text ?? ''
    const o = JSON.parse(brut.slice(brut.indexOf('{'), brut.lastIndexOf('}') + 1))
    const nom = (o.lieu_nom ?? '').trim() || null
    const commune = (o.commune ?? '').trim() || null

    if (!nom && !commune) {
      sansLieu++
      console.log(`${num} —      ${e.titre.slice(0, 44).padEnd(46)} l'affiche ne dit pas où`)
      continue
    }

    const geo = await geocodeWithGoogle(nom, commune)
    if (geo.lat == null) {
      sansLieu++
      console.log(`${num} —      ${e.titre.slice(0, 44).padEnd(46)} « ${nom ?? commune} » introuvable`)
      continue
    }

    const zone = await checkZone(geo.lat, geo.lng)
    if (!zone.within) {
      horsZone++
      console.log(`${num} LOIN   ${e.titre.slice(0, 44).padEnd(46)} ${zone.distanceMin} km — refusé`)
      continue
    }

    const lieu = await trouverOuCreerLieu(nom ?? commune ?? '', commune, {
      lat: geo.lat, lng: geo.lng, adresse: geo.adresse ?? o.adresse ?? null,
      place_id_google: geo.place_id_google,
    })
    if (!lieu.id) { echecs++; console.log(`${num} KO     ${e.titre.slice(0, 44)} — ${lieu.error}`); continue }

    const { error } = await db.from('evenements').update({ lieu_id: lieu.id }).eq('id', e.id)
    if (error) { echecs++; console.log(`${num} KO     ${error.message}`); continue }

    rattaches++
    console.log(`${num} ok ${String(Math.round(zone.distanceMin)).padStart(3)} km ${e.titre.slice(0, 40).padEnd(42)} → ${(nom ?? '').slice(0, 26)} · ${commune ?? '?'}`)
  } catch (err) {
    echecs++
    console.log(`${num} ECHEC  ${e.titre.slice(0, 44)} — ${String(err.message).slice(0, 50)}`)
  }
}

console.log(`\n${rattaches} rattaché(s) · ${sansLieu} sans lieu nommé · ${horsZone} refusé(s) hors zone · ${echecs} échec(s).`)
console.log('Aucun statut ni texte modifié.')
