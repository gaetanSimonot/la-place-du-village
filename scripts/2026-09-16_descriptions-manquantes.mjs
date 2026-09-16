/**
 * LES FICHES SANS DESCRIPTION, RELUES.
 *
 * Une fiche sans description reste « à traiter » et n'arrive jamais dans
 * l'agenda. Mesuré le 16/09/2026 : 55 des 120 fiches en attente n'avaient que
 * ce défaut, et 52 d'entre elles portaient pourtant une affiche.
 *
 * La cause était dans les prompts — le champ était déclaré « string ou null »
 * et rien ne disait qu'il fallait le remplir, si bien qu'une ligne de
 * programme de festival, qui ne porte qu'un titre et une heure, repartait
 * vide. Les prompts sont corrigés ; ce script rattrape l'existant.
 *
 * IL NE TOUCHE QUE LA DESCRIPTION. Ni la date, ni le lieu, ni la catégorie, ni
 * le statut : ce qu'une main a déjà corrigé ne doit pas être réécrit par une
 * relecture. La mise en ligne reste ta décision.
 *
 * ON RELIT L'AFFICHE, pas seulement le titre. C'est elle qui porte le
 * contexte — le nom du festival, le lieu exact, l'enchaînement des horaires.
 *
 *   node scripts/2026-09-16_descriptions-manquantes.mjs              → à blanc
 *   node scripts/2026-09-16_descriptions-manquantes.mjs --appliquer  → écrit
 */
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'

const env = fs.readFileSync('.env.local', 'utf8')
const val = (k) => { const m = env.match(new RegExp('^' + k + '=(.*)$', 'm')); return m ? m[1].trim().replace(/^["']|["']$/g, '') : null }
const db = createClient(val('NEXT_PUBLIC_SUPABASE_URL'), val('SUPABASE_SERVICE_KEY'))
const ai = new Anthropic({ apiKey: val('ANTHROPIC_API_KEY') })

const APPLIQUER = process.argv.includes('--appliquer')

const SYSTEME = `Tu écris la description d'un événement local, pour une application de village.

On te donne son affiche et les informations déjà connues. Rends UNIQUEMENT un JSON :
{"description": "…"}

Une à trois phrases. Courtes, factuelles, utiles à quelqu'un qui décide d'y aller.

TROIS INTERDITS :
- N'invente RIEN qui ne figure pas sur l'affiche ou dans les informations fournies. Ni résumé d'intrigue, ni nom d'artiste, ni tarif, ni public visé. Une phrase courte et sûre vaut infiniment mieux qu'un paragraphe plausible et faux.
- Ne recopie pas le titre tel quel : une description qui répète le titre n'apprend rien.
- Pas de formule d'accroche ("Ne manquez pas", "Un moment inoubliable") : on informe, on ne vend pas.

Si l'affiche ne porte aucun texte de présentation — cas d'un programme de festival ou d'une grille de cinéma —, compose à partir de ce que tu sais : la nature de l'événement, le jour, l'heure, la commune, et le cadre s'il y en a un.`

const { data: fiches } = await db
  .from('evenements')
  .select('id, titre, description, image_url, date_debut, heure, categorie, lieux(nom, commune)')
  .eq('statut', 'en_attente')
  .order('created_at', { ascending: false })
  .limit(300)

const aFaire = (fiches ?? []).filter(e => (e.description ?? '').trim().length < 10)
console.log(`fiches en attente        : ${fiches?.length}`)
console.log(`sans description         : ${aFaire.length}`)
console.log(`   dont avec une affiche : ${aFaire.filter(e => e.image_url).length}\n`)

if (!APPLIQUER) {
  for (const e of aFaire.slice(0, 20)) console.log(`  ${e.image_url ? 'affiche' : '   -   '} ${e.titre.slice(0, 62)}`)
  console.log('\nÀ BLANC — rien écrit. Relancer avec --appliquer.')
  process.exit(0)
}

let ecrites = 0, echecs = 0
for (const [i, e] of aFaire.entries()) {
  const lieu = e.lieux
  const contexte = JSON.stringify({
    titre: e.titre, date: e.date_debut, heure: e.heure,
    categorie: e.categorie, lieu: lieu?.nom ?? null, commune: lieu?.commune ?? null,
  })

  const contenu = []
  if (e.image_url) {
    try {
      const r = await fetch(e.image_url)
      const buf = Buffer.from(await r.arrayBuffer())
      // 4 Mo : au-delà l'API refuse, et une affiche plus lourde n'apporte rien.
      if (buf.length < 4_000_000) {
        contenu.push({
          type: 'image',
          source: { type: 'base64', media_type: r.headers.get('content-type')?.startsWith('image/png') ? 'image/png' : 'image/jpeg', data: buf.toString('base64') },
        })
      }
    } catch { /* affiche illisible : on écrit d'après le contexte seul */ }
  }
  contenu.push({ type: 'text', text: `Informations connues :\n${contexte}` })

  try {
    const rep = await ai.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 400, temperature: 0,
      system: SYSTEME, messages: [{ role: 'user', content: contenu }],
    })
    const brut = rep.content.find(c => c.type === 'text')?.text ?? ''
    const o = JSON.parse(brut.slice(brut.indexOf('{'), brut.lastIndexOf('}') + 1))
    const d = String(o.description ?? '').trim()

    // Deux refus : trop courte pour servir, ou simple copie du titre.
    const memeQueTitre = d.toLowerCase().replace(/[^a-z0-9]/g, '') === e.titre.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (d.length < 20 || memeQueTitre) {
      console.log(`  ${String(i + 1).padStart(3)} ignoree  ${e.titre.slice(0, 44)} — « ${d.slice(0, 40)} »`)
      echecs++
      continue
    }

    const { error } = await db.from('evenements').update({ description: d }).eq('id', e.id)
    if (error) { console.log(`  ${String(i + 1).padStart(3)} KO       ${error.message}`); echecs++; continue }
    ecrites++
    console.log(`  ${String(i + 1).padStart(3)} ok  ${String(d.length).padStart(4)} car. ${e.titre.slice(0, 38).padEnd(40)} ${d.slice(0, 64)}`)
  } catch (err) {
    echecs++
    console.log(`  ${String(i + 1).padStart(3)} ECHEC    ${e.titre.slice(0, 44)} — ${err.message.slice(0, 60)}`)
  }
}

console.log(`\n${ecrites} description(s) écrite(s), ${echecs} laissée(s) de côté.`)
console.log('Aucun statut modifié : la mise en ligne reste ta décision.')
