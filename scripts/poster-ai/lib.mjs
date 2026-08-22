/**
 * POSTER AI — lib partagée (CLI + interface web).
 * Styles/univers, règles d'abstraction, construction des prompts, appel OpenAI.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(__dirname, '..', '..')
export const OUT_DIR = path.join(__dirname, 'output')

// ── .env.local ────────────────────────────────────────────────────────────
function loadEnv(file) {
  if (!fs.existsSync(file)) throw new Error(`.env.local introuvable : ${file}`)
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let v = m[2]
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!(m[1] in process.env)) process.env[m[1]] = v
  }
}
loadEnv(path.join(ROOT, '.env.local'))

export const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY

export const MODEL = 'gpt-image-1'   // change ici si accès à un modèle plus récent
export const FOOTER = 'laplaceduvillage.app'

// ── Formats ───────────────────────────────────────────────────────────────
export const FORMATS = {
  affiche:  { size: '1024x1536', label: 'Affiche (portrait)' },
  carre:    { size: '1024x1024', label: 'Carré (réseaux)' },
  banniere: { size: '1536x1024', label: 'Bannière (paysage / Facebook)' },
}

// ── 3 univers / styles ──────────────────────────────────────────────────────
export const STYLES = {
  magazine: {
    label: 'Magazine',
    prompt:
      "Univers « couverture de magazine culturel haut de gamme » : mise en page typographique forte et éditoriale, " +
      "titre traité comme une accroche de couverture, hiérarchie de texte claire, généreux espaces négatifs, chic et sophistiqué. " +
      "Fond en aplats de couleur et formes géométriques subtiles ou texture minimale. Sensation de papier glacé, moderne et raffiné.",
  },
  classique: {
    label: 'Classique',
    prompt:
      "Univers « affiche d'art classique et intemporelle » : composition équilibrée et élégante, typographie soignée avec empattements, " +
      "palette chaleureuse et sobre (crèmes, ocres, tons profonds), ornements discrets, légère texture papier. " +
      "Esprit sérigraphie / affiche de théâtre ancienne revisitée, distingué et rassurant.",
  },
  moderne: {
    label: 'Moderne',
    prompt:
      "Univers « design graphique contemporain » : grandes formes géométriques, dégradés tendance, couleurs vives mais maîtrisées, " +
      "minimalisme assumé, identité visuelle de festival actuel. Composition audacieuse et épurée, très « branding » moderne.",
  },
}

// Influence de PALETTE uniquement (pas d'objets littéraux) selon la catégorie
const AMBIANCE = {
  concert: 'énergique et vibrante', theatre: 'théâtrale et contrastée', sport: 'dynamique et tonique',
  marche: 'naturelle et chaleureuse', atelier: 'créative et douce', fete: 'festive et joyeuse',
  sante_bien_etre: 'apaisante et zen', autre: 'chaleureuse et conviviale',
}

// ── Helpers événement ───────────────────────────────────────────────────────
export function eventLieu(ev) {
  return ev.lieux ? [ev.lieux.nom, ev.lieux.commune].filter(Boolean).join(', ') : (ev.lieu || '')
}
function frDate(ymd, heure) {
  if (!ymd) return ''
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(y, (m || 1) - 1, d || 1)
  const s = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(dt)
  return heure ? `${s} à ${String(heure).slice(0, 5).replace(':', 'h')}` : s
}
export function whenText(ev) {
  if (!ev.date_debut) return ''
  if (ev.date_fin && ev.date_fin !== ev.date_debut) return `du ${frDate(ev.date_debut)} au ${frDate(ev.date_fin)}`
  return frDate(ev.date_debut, ev.heure)
}

// ── Construction du prompt ──────────────────────────────────────────────────
export function buildPrompt(ev, formatKey, styleKey) {
  const style = STYLES[styleKey] || STYLES.moderne
  const ambiance = AMBIANCE[ev.categorie] || AMBIANCE.autre
  const lieu = eventLieu(ev)
  const when = whenText(ev)

  const compo = {
    affiche:  "Format AFFICHE verticale (portrait). Titre dominant, date et lieu clairement lisibles plus bas. Composition prête à imprimer.",
    carre:    "Format CARRÉ pour réseaux sociaux (Instagram). Composition centrée et équilibrée, titre bien lisible.",
    banniere: "Format BANNIÈRE horizontale large (couverture d'événement Facebook). Garde TOUT le texte important dans la bande centrale (rien de crucial près des bords haut/bas, qui seront rognés).",
  }[formatKey]

  return [
    "Crée un visuel de COMMUNICATION pour un événement local, destiné aux réseaux sociaux.",
    `STYLE À RESPECTER — ${style.label} : ${style.prompt}`,
    compo,
    `Palette inspirée d'une ambiance ${ambiance} (influence de COULEUR uniquement).`,
    "",
    "RÈGLES STRICTES :",
    "• Visuel ABSTRAIT / graphique. NE PAS illustrer littéralement les mots du titre.",
    "• NE JAMAIS produire une image réaliste qui pourrait être prise pour une vraie photo de l'événement, du lieu ou des participants. Pas de photo de foule, de scène, de salle, de personnes reconnaissables.",
    "• Neutre et élégant : une belle toile de fond, pas une illustration du contenu.",
    "",
    "TEXTE à afficher (en français, parfaitement orthographié, lisible, sans aucune faute) :",
    `• Titre : « ${ev.titre || 'Événement'} »`,
    when ? `• Date : « ${when} »` : "• (pas de date à afficher)",
    lieu ? `• Lieu : « ${lieu} »` : "",
    `• Petite ligne discrète en bas : « ${FOOTER} »`,
    "N'ajoute aucun autre texte, aucun faux logo. Qualité pro, épuré, aéré.",
  ].filter(Boolean).join('\n')
}

// ── Récupération événement ──────────────────────────────────────────────────
async function sbGet(query) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/evenements?${query}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  })
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`)
  return r.json()
}
export async function fetchEventById(id) {
  const rows = await sbGet(`id=eq.${encodeURIComponent(id)}&select=*,lieux(*)`)
  if (!rows.length) throw new Error(`Aucun événement avec id=${id}`)
  return rows[0]
}
export async function fetchLatestEvent() {
  // de préférence un événement daté (pour voir la ligne date)
  let rows = await sbGet(`statut=eq.publie&date_debut=not.is.null&order=date_debut.desc&limit=1&select=*,lieux(*)`)
  if (!rows.length) rows = await sbGet(`statut=eq.publie&order=created_at.desc&limit=1&select=*,lieux(*)`)
  if (!rows.length) throw new Error('Aucun événement publié trouvé')
  return rows[0]
}

// ── Appel OpenAI ────────────────────────────────────────────────────────────
export async function generateImage(prompt, size, quality = 'low') {
  const r = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, prompt, n: 1, size, quality }),
  })
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 400)}`)
  const j = await r.json()
  const b64 = j.data?.[0]?.b64_json
  if (!b64) throw new Error('Réponse OpenAI sans image')
  return Buffer.from(b64, 'base64')
}
