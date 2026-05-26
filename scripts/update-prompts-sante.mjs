// Script ponctuel : ajout categorie "sante_bien_etre" dans les 3 prompts IA
// d'extraction (extract_single, extract_multiple, scrape) + bloc INDICES qui
// guide Claude pour la classification.
//
// A executer une fois depuis la racine du projet : node scripts/update-prompts-sante.mjs
// Source de verite ensuite = table prompts_ia. Editable via /admin/prompts.

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

// Parse .env.local (KEY=VALUE par ligne, sans interpretation shell)
const envText = readFileSync('.env.local', 'utf8')
const env = Object.fromEntries(
  envText.split(/\r?\n/)
    .filter(l => l && !l.startsWith('#'))
    .map(l => {
      const idx = l.indexOf('=')
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^["']|["']$/g, '')]
    })
)

const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_KEY
if (!url || !key) {
  console.error('Variables manquantes dans .env.local')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

const INDICES = `

INDICES POUR CHOISIR LA CATEGORIE (utilise sans hesiter sante_bien_etre des qu'un theme sante apparait) :
- sante_bien_etre : tout ce qui touche a la sante au sens large.
  Inclut : conferences sante, depistages, prevention, journees portes ouvertes hopital/clinique, premiers secours/PSC1, don du sang, forums sante, parentalite/maternite ; therapies douces et alternatives (reflexologie, kinesiologie, energetique, biodynamie, reiki, hypnose, fleurs de Bach) ; pratiques spirituelles ou de guerison (chamanisme, meditation, retraites de guerison, stages d'eveil, cercle de chant, ceremonies de cacao, soin sonore avec gongs/bols/handpan) ; pratiques corporelles douces (qi gong, yoga, tai-chi, danse extatique / ecstatic dance, do-in, automassage, etirements, sophrologie, gym douce) ; ateliers sante mentale (groupes de parole, depression, addictions, deuil) ; medecine alternative (naturopathie, osteopathie, acupuncture, herboristerie, aromatherapie).
- atelier : creations manuelles/artistiques PURES (couture, poterie, ecriture, cuisine, jardinage, photographie...) SANS dimension therapeutique ou spirituelle.
- concert : musique live (sauf cercle de chant therapeutique ou soin sonore -> sante_bien_etre).
- theatre : spectacle vivant, theatre, cinema, performance artistique.
- sport : competitions, randos, courses, activites physiques competitives (le yoga doux -> sante_bien_etre).
- marche : marches alimentaires, vide-grenier, brocantes, foires.
- fete : celebrations, festivals (sauf festivals sante/bien-etre -> sante_bien_etre), soirees dansantes (sauf ecstatic dance -> sante_bien_etre).
- autre : si rien ne correspond clairement.

EN CAS D'HESITATION : si l'evenement mentionne therapie, guerison, energie, soin, spirituel, meditation, chamane, bien-etre, holistique, retraite, eveil de conscience, dispositif de guerison, cercle, medecine douce, sophro, yoga, qi gong, ecstatic, chamanique -> choisis sante_bien_etre.`

const prompts = {
  extract_single: `Tu es un assistant qui extrait des informations d'evenements locaux.
Aujourd'hui nous sommes le {{today}}. Utilise cette date pour resoudre toute reference relative : "ce samedi", "le 15", "ce mois-ci", "la semaine prochaine", "demain", etc.
Contexte geographique : tous les evenements ont lieu dans l'Herault (34) ou le Gard (30), region de Ganges / Cevennes, sauf mention contraire explicite. Si une commune est ambigue, privilegie toujours la commune de cette region. Mets "34" dans code_postal si la commune est de l'Herault, "30" si elle est du Gard, "34" par defaut si aucun code n'est precise.
Reponds UNIQUEMENT avec un JSON valide, sans markdown ni explication.
Structure attendue :
{
  "titre": "string",
  "description": "string",
  "date_debut": "YYYY-MM-DD ou null",
  "date_fin": "YYYY-MM-DD ou null",
  "heure": "HH:MM ou null",
  "categorie": "concert|theatre|sport|marche|atelier|fete|sante_bien_etre|autre",
  "lieu_nom": "string ou null",
  "lieu_adresse": "string ou null",
  "commune": "string ou null",
  "code_postal": "string ou null",
  "prix": "string ou null",
  "contact": "string ou null",
  "organisateurs": "string ou null"
}` + INDICES,

  extract_multiple: `Tu es un assistant qui extrait des informations d'evenements locaux.
Aujourd'hui nous sommes le {{today}}. Utilise cette date pour resoudre toute reference relative.
Contexte geographique : tous les evenements ont lieu dans l'Herault (34) ou le Gard (30), region de Ganges / Cevennes, sauf mention contraire explicite.
IMPORTANT : Extrais TOUS les evenements presents (il peut y en avoir plusieurs sur une meme affiche ou programme). Ne limite pas le nombre.
Reponds UNIQUEMENT avec un tableau JSON valide, sans markdown ni explication. Si un seul evenement, retourne quand meme un tableau a 1 element.
Structure de chaque objet :
{
  "titre": "string",
  "description": "string ou null",
  "date_debut": "YYYY-MM-DD ou null",
  "date_fin": "YYYY-MM-DD ou null",
  "heure": "HH:MM ou null",
  "categorie": "concert|theatre|sport|marche|atelier|fete|sante_bien_etre|autre",
  "lieu_nom": "string ou null",
  "lieu_adresse": "string ou null",
  "commune": "string ou null",
  "code_postal": "string ou null",
  "prix": "string ou null",
  "contact": "string ou null",
  "organisateurs": "string ou null"
}` + INDICES,

  scrape: `Tu analyses le contenu textuel d'une page web d'agenda d'evenements locaux dans l'Herault (34) ou le Gard (30), France, region de Ganges / Cevennes.
Aujourd'hui : {{today}}.
Extrait TOUS les evenements presents dans ce texte. Ne limite pas le nombre.
Reponds UNIQUEMENT avec un tableau JSON valide (sans markdown).
Si aucun evenement, retourne [].
Structure de chaque objet :
{
  "titre": "string",
  "description": "string ou null",
  "date_debut": "YYYY-MM-DD ou null",
  "date_fin": "YYYY-MM-DD ou null",
  "heure": "HH:MM ou null",
  "categorie": "concert|theatre|sport|marche|atelier|fete|sante_bien_etre|autre",
  "lieu_nom": "string ou null",
  "commune": "string ou null",
  "code_postal": "34xxx ou 30xxx ou null",
  "prix": "string ou null",
  "contact": "string ou null",
  "organisateurs": "string ou null"
}` + INDICES,
}

console.log('Mise a jour des prompts IA...\n')

for (const [id, systeme] of Object.entries(prompts)) {
  const { error } = await supabase
    .from('prompts_ia')
    .update({ systeme, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) {
    console.error(`  ${id} : ECHEC -`, error.message)
    process.exit(1)
  } else {
    console.log(`  ${id} : OK (${systeme.length} chars)`)
  }
}

console.log('\nTermine. Les nouveaux prompts seront visibles dans /admin/prompts.')
console.log('Cache runtime 60s -> propagation au prochain extract Claude apres ~1 min.')
