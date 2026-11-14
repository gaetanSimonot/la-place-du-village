import Anthropic from '@anthropic-ai/sdk'
import { getPrompt } from './prompts-ia'
import { safeJsonParse } from './safeJsonParse'
import type { Territoire } from './territoires'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface ExtractedData {
  titre: string
  description: string | null
  date_debut: string | null
  date_fin: string | null
  heure: string | null
  categorie: string
  lieu_nom: string | null
  lieu_adresse: string | null
  commune: string | null
  code_postal: string | null
  prix: string | null
  contact: string | null
  organisateurs: string | null
  /**
   * Jours reels d'un rendez-vous qui revient, ISO 8601 (1=lundi, 7=dimanche).
   * `null` = pas de recurrence : l'evenement vaut tous les jours de sa periode,
   * ce qui est la bonne reponse pour une exposition ouverte en continu.
   */
  jours_semaine?: number[] | null
  /**
   * Les jours OU l'evenement a lieu, un par un. C'est ce qui fait foi quand
   * c'est renseigne : une regle ne sait pas dire « sauf le 25 decembre ».
   */
  dates?: string[] | null
}

export interface GeoResult {
  place_id_google: string | null
  lat: number | null
  lng: number | null
  adresse: string | null
  approx: boolean
}

/**
 * LE SECTEUR QU'ON ANNONCE AU MODÈLE.
 *
 * Les prompts disaient « tous les événements ont lieu dans l'Hérault ou le
 * Gard, région de Ganges ». Depuis l'ouverture de Pau, c'est faux : un post
 * du groupe « Concerts sur Pau » qui ne nommait pas sa ville est ressorti
 * « Ganges, 34190 », avec une adresse inventée, a été géocodé sur un bar de
 * Ganges — puis rangé en Cévennes, puisque c'est le point qui tranche (vu le
 * 14/11/2026, idem « Cavalcade de Gan » devenue « à Ganges »).
 *
 * Le secteur vient donc du territoire de la source. Sans territoire connu
 * (saisie admin, radio), on prend le territoire par défaut — c'est-à-dire ce
 * que disait l'ancien texte. Import dynamique : territoires.ts importe déjà
 * ce fichier.
 */
async function contexteGeo(territoire?: Territoire | null): Promise<string> {
  let t = territoire ?? null
  if (!t) {
    try { t = await (await import('./territoires')).territoireParDefaut() } catch { t = null }
  }
  const secteur = t
    ? `le territoire « ${t.nom} » (${t.indice_geo?.trim() || INDICE_GEO_SECTEUR})`
    : `les Cevennes (Herault, Gard)`
  return `Contexte geographique : ce contenu provient de ${secteur}. Sauf mention contraire explicite, les evenements ont lieu dans ce secteur ; si une commune est ambigue, privilegie celle de ce secteur. `
    + `N'invente JAMAIS une commune, une adresse ou un code postal qui ne figure pas dans le contenu : laisse le champ a null. Une commune voisine au nom proche n'est pas la meme commune (Gan n'est pas Ganges).`
}

export async function extractWithClaude(text: string | null, imageBase64?: string, imageMimeType?: string, territoire?: Territoire | null): Promise<ExtractedData> {
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const systemPrompt = await getPrompt('extract_single', { today, contexte_geo: await contexteGeo(territoire) })

  const userText = text
    ? `Extrais les informations de cet événement :\n\n${text}`
    : "Extrais les informations de cet événement depuis cette affiche :"

  const mimeType = (imageMimeType || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

  const content: Anthropic.MessageParam['content'] = imageBase64
    ? [
        { type: 'text', text: userText },
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
      ]
    : userText

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    temperature: 0,
    system: systemPrompt,
    messages: [{ role: 'user', content }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : ''
  const parsed = safeJsonParse<ExtractedData>(raw)
  if (!parsed) throw new Error('Réponse Claude JSON irréparable')
  return parsed
}

export async function extractMultipleWithClaude(text: string | null, imageBase64?: string, imageMimeType?: string, territoire?: Territoire | null): Promise<ExtractedData[]> {
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const systemPrompt = await getPrompt('extract_multiple', { today, contexte_geo: await contexteGeo(territoire) })

  const userText = text
    ? `Extrais TOUS les événements de ce contenu :\n\n${text}`
    : "Extrais TOUS les événements présents sur cette affiche ou programme :"

  const mimeType = (imageMimeType || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

  const content: Anthropic.MessageParam['content'] = imageBase64
    ? [
        { type: 'text', text: userText },
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
      ]
    : userText

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 16384,
    temperature: 0,
    system: systemPrompt,
    messages: [{ role: 'user', content }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : '[]'
  const parsed = safeJsonParse<unknown>(raw)
  if (parsed == null) {
    // jsonrepair n'a pas pu sauver la sortie → on retourne [] plutôt que throw,
    // pour ne pas faire planter le batch entier (et le sender VM en 5xx).
    return []
  }
  const arr = Array.isArray(parsed) ? parsed : [parsed]
  // Filtre : entrée valide ET titre non vide (Claude retourne parfois titre:null
  // sur des messages qui ne sont pas vraiment des events → on ne tente pas
  // l'insert pour éviter le crash NOT NULL constraint).
  return arr.filter((e): e is ExtractedData =>
    e != null
    && typeof e === 'object'
    && typeof (e as ExtractedData).titre === 'string'
    && (e as ExtractedData).titre.trim().length > 0
  )
}

/**
 * Les jours d'un rendez-vous qui revient, nettoyes.
 *
 * Ce qui sort du modele passe par ici avant d'atteindre la base : on ne garde
 * que des entiers 1..7, dedoublonnes et tries. Hors bornes ou vide -> `null`,
 * c'est-a-dire « pas de recurrence connue », le defaut sur : l'evenement reste
 * visible tous les jours de sa periode, comme avant cette colonne.
 *
 * La contrainte SQL `evenements_jours_semaine_valides` dit la meme chose cote
 * base — mais une valeur refusee la-bas ferait echouer l'insert ENTIER et
 * perdrait l'evenement. Le filtre doit donc etre ici aussi.
 */
export function nettoyerJoursSemaine(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null
  // Array.from plutot que l'etalement d'un Set : la cible TypeScript du projet
  // n'autorise pas l'iteration directe d'un Set.
  const jours = Array.from(new Set(
    v.map(x => Number(x)).filter(n => Number.isInteger(n) && n >= 1 && n <= 7),
  )).sort((a, b) => a - b)
  return jours.length ? jours : null
}

const randOffset = () => Math.random() * 0.004 - 0.002

// Client Supabase admin pour DB-first (cache lieux)
import { createClient } from '@supabase/supabase-js'
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

/**
 * ON DIT A GOOGLE OU REGARDER.
 *
 * Sans repere, « Lasalle » peut sortir n'importe quel homonyme de la planete :
 * une affiche annoncait un atelier velo a Lasalle, a 17 km de Ganges, et
 * Google a rendu un commerce a Dour, EN BELGIQUE, a 719 km — avec un
 * identifiant parfaitement valide. Idem pour un « Antirouille » au Quebec et
 * un « Golf de Casiac » en Italie.
 *
 * `location` + `radius` ne ferment pas la recherche, ils la PENCHENT : a nom
 * egal, Google prefere ce qui est proche. C'est exactement ce qu'on veut —
 * pas d'exclusion brutale, juste l'evidence locale d'abord. Le rayon est
 * large a dessein : il oriente, il ne filtre pas, et le controle de zone
 * s'occupe ensuite de ce qui est vraiment trop loin.
 */
const REPERE = { lat: 43.9339831, lng: 3.7088474, rayonM: 60_000 }   // Ganges

type ResultatGoogle = Omit<GeoResult, 'approx'>

/**
 * Google Places Text Search, en gardant le PREMIER RÉSULTAT QUI PASSE LE
 * CONTRÔLE — et non le premier tout court.
 *
 * Text Search cherche des LIEUX, pas des adresses. Interrogé avec « 17 cours
 * de la République, 34190 Ganges », il rend l'office de tourisme, les Halles
 * et une brûlerie : des commerces du quartier, aucun au 17. Le premier était
 * pris les yeux fermés : l'Afrobar s'est retrouvé posé sur les Halles (vu le
 * 12/11/2026). Interrogé avec un nom, il rend parfois l'homonyme de la commune
 * voisine (« Salle du Foyer, Fournès » → Fontanès).
 *
 * Sans `accepte`, comportement historique (premier résultat).
 */
async function textsearch(
  query: string,
  accepte?: (r: ResultatGoogle) => boolean,
): Promise<ResultatGoogle | null> {
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json`
    + `?query=${encodeURIComponent(query)}`
    + `&location=${REPERE.lat},${REPERE.lng}&radius=${REPERE.rayonM}&region=fr&language=fr`
    + `&key=${process.env.GOOGLE_PLACES_KEY}`
  const res = await fetch(url)
  const data = await res.json()
  for (const p of (data.results ?? []).slice(0, 5)) {
    const r: ResultatGoogle = {
      place_id_google: p.place_id ?? null,
      lat: p.geometry?.location?.lat ?? null,
      lng: p.geometry?.location?.lng ?? null,
      adresse: p.formatted_address ?? null,
    }
    if (r.lat == null || r.lng == null) continue
    if (!accepte || accepte(r)) return r
  }
  return null
}

/** Minuscules, sans accents, mots séparés par une espace. */
function plat(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * Communes fusionnées : Google rend le nom de la commune NOUVELLE, les
 * annonces gardent l'ancien. Sans cette table, le contrôle de commune
 * refuserait tout Valleraugue.
 */
const COMMUNES_FUSIONNEES: Record<string, string> = {
  'valleraugue': 'val d aigoual',
  'notre dame de la rouviere': 'val d aigoual',
}

/** Commune ramenée à une forme comparable : « St-Hippolyte » = « Saint-Hippolyte ». */
function communeCle(s: string | null | undefined): string {
  const v = plat(s).replace(/^(st|ste)\b/, m => (m === 'st' ? 'saint' : 'sainte'))
  return COMMUNES_FUSIONNEES[v] ?? v
}

/**
 * Le résultat est-il dans la commune demandée ?
 *
 * La commune lue par le modèle peut en contenir plusieurs (« Ganges,
 * Montpellier ») : une seule suffit. Le code postal SEUL ne suffit pas —
 * 34190 couvre Ganges, Cazilhac, Laroque, Brissac… et c'est précisément entre
 * communes voisines que les erreurs se font.
 *
 * Pas de commune demandée → rien à contrôler. Résultat sans commune lisible
 * alors qu'on en demandait une → refusé : on préfère le centre du village à
 * un point qu'on ne sait pas situer.
 */
function dansLaCommune(r: ResultatGoogle, commune: string | null | undefined): boolean {
  if (!communesVoulues(commune).length) return true
  return memeCommune(communeDepuisAdresse(r.adresse), commune)
}

function communesVoulues(commune: string | null | undefined): string[] {
  return (commune ?? '').split(/[,/]| et /).map(communeCle).filter(c => c.length > 1)
}

/**
 * Deux écritures de commune désignent-elles la même ?
 *
 * Par PRÉFIXE, pas par inclusion : « Saint-Hippolyte » = « Saint-Hippolyte-
 * du-Fort », mais « Alès » ≠ « Saint-Christol-lez-Alès » — l'inclusion
 * laissait passer la commune voisine qui porte le nom de la ville en suffixe.
 */
function memeCommune(trouvee: string | null | undefined, commune: string | null | undefined): boolean {
  const t = communeCle(trouvee)
  if (!t) return false
  return communesVoulues(commune).some(v => t === v || t.startsWith(v + ' ') || v.startsWith(t + ' '))
}

/** Abréviations de voie que Google emploie dans ses adresses. */
const ABREV_VOIE: Record<string, string> = {
  cr: 'cours', av: 'avenue', bd: 'boulevard', pl: 'place', chem: 'chemin',
  rte: 'route', imp: 'impasse', all: 'allee', prom: 'promenade', pass: 'passage',
  fg: 'faubourg', sq: 'square', st: 'saint', ste: 'sainte',
}
const MOTS_VIDES_VOIE = new Set([
  'de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'a', 'au', 'aux', 'et', 'bis', 'ter',
  'rue', 'route', 'avenue', 'boulevard', 'chemin', 'impasse', 'place', 'allee',
  'quai', 'cours', 'faubourg', 'lotissement', 'hameau', 'promenade', 'passage', 'square',
])
function motsDeVoie(s: string): string[] {
  return plat(s).split(' ').map(m => ABREV_VOIE[m] ?? m)
}

/**
 * Le résultat porte-t-il bien la RUE demandée ?
 *
 * On ne garde que les mots qui nomment la voie (« République » dans « 17
 * cours de la République ») et on exige qu'ils figurent tous dans l'adresse
 * rendue par Google. Le numéro n'entre pas en compte : Text Search ne le
 * connaît pas de toute façon. Une adresse sans mot distinctif (« 30460
 * Lasalle ») ne se contrôle pas : on s'en remet à la commune.
 */
/** « 4, rue Neuve, Anduze » → « rue Neuve » : la voie, sans numéro ni suite. */
function rueSeule(adresse: string): string {
  return adresse.replace(/^\s*\d+\s*(bis|ter|[a-d])?\b\s*,?\s*/i, '').split(',')[0].trim()
}

function porteLaRue(r: ResultatGoogle, adresse: string): boolean {
  const voulus = motsDeVoie(rueSeule(adresse)).filter(m => m.length > 1 && !/^\d/.test(m) && !MOTS_VIDES_VOIE.has(m))
  if (!voulus.length) return true
  const rendus = motsDeVoie(r.adresse ?? '')
  // Une lettre d'écart tolérée sur les mots longs : les annonces sont tapées
  // vite (« carrierrasse » pour « Carrierasse »).
  return voulus.every(m => rendus.some(x => x === m || (m.length >= 6 && uneLettreDEcart(m, x))))
}

function uneLettreDEcart(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0, j = 0, ecarts = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue }
    if (++ecarts > 1) return false
    if (a.length > b.length) i++
    else if (b.length > a.length) j++
    else { i++; j++ }
  }
  return ecarts + (a.length - i) + (b.length - j) <= 1
}

/**
 * Le nom d'un lieu, ramené à ce qui l'identifie vraiment.
 *
 * Une affiche écrit « Chez Milonga », la base dit « Milonga Cave » et la fiche
 * établissement « Le Milonga – Bar à vins & restaurant ». Trois écritures, un
 * seul endroit. On retire donc les accents, la ponctuation, et les mots de
 * tête qui ne désignent rien — c'est ce qui permet aux trois de se rejoindre.
 */
const MOTS_DE_TETE = /^(chez|le|la|les|l|au|aux|du|de|des|a|salle|espace)\s+/
function nomCle(s: string | null | undefined): string {
  let v = (s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  // Deux passes : « chez le milonga » perd ses deux mots de tête.
  for (let i = 0; i < 2; i++) v = v.replace(MOTS_DE_TETE, '')
  return v.trim()
}

/**
 * Noms trop courants pour désigner un endroit précis. Mesuré sur la base :
 * 16 noms y sont portés par des lieux distants de plus de 2 km, et ce sont
 * tous ceux-là. Sur un nom de cette liste on ne devine pas — on laisse Google
 * trancher avec la commune, comme avant.
 */
const NOMS_TROP_COURANTS = new Set([
  'place de la mairie', 'place du village', 'place de la republique', 'place',
  'salle des fetes', 'salle polyvalente', 'foyer', 'foyer rural', 'mairie',
  'stade', 'ecole', 'eglise', 'temple', 'parking', 'boulangerie', 'bar',
  'cafe', 'restaurant', 'la grange', 'le village', 'centre', 'gymnase',
  'mediatheque', 'bibliotheque', 'chez moi', 'domicile', 'maison',
])

interface CandidatLieu {
  nom: string
  commune: string | null
  adresse: string | null
  lat: number | null
  lng: number | null
  place_id_google: string | null
}

/** Distance à vol d'oiseau, pour juger si deux homonymes sont le même endroit. */
function ecartKm(a: CandidatLieu, b: CandidatLieu): number {
  if (a.lat == null || b.lat == null || a.lng == null || b.lng == null) return Infinity
  const r = (d: number) => (d * Math.PI) / 180
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}

/**
 * CHERCHER DANS CE QU'ON SAIT DÉJÀ, avant de demander à Google.
 *
 * Le pipeline le faisait, mais en exigeant le nom EXACT (`ilike` sans joker)
 * et dans la seule table `lieux`. « Chez Milonga » ne retrouvait donc pas
 * « Milonga Cave », pourtant à Ganges avec ses coordonnées : Google partait
 * chercher à l'aveugle et rendait un point à 252 km, que le filtre de zone
 * écartait. L'événement disparaissait — 207 rejets « hors zone » en deux mois,
 * dont une bonne part de lieux que la base connaissait par cœur.
 *
 * Ici on compare des noms NORMALISÉS, on regarde aussi les fiches
 * établissement — la source la mieux tenue du projet — et on s'abstient dès
 * que le nom ne désigne pas un endroit unique.
 *
 * Trois refus, dans cet ordre :
 *   1. nom trop court (< 5) ou trop courant → on ne devine pas ;
 *   2. commune donnée qui ne concorde pas → ce n'est pas le même endroit ;
 *   3. plusieurs candidats à plus de 2 km → ambigu, on laisse Google.
 *
 * Un refus n'est jamais une perte : on retombe exactement sur le comportement
 * d'avant.
 */
/**
 * CETTE ADRESSE EST-ELLE DEJÀ CONNUE DE NOUS ?
 *
 * Le cache par NOM existait ; celui par ADRESSE manquait, et c'est lui qui
 * compte depuis que l'adresse postale passe en premier. Résultat : « Rue du
 * Château, Pau » était en base depuis le premier passage et se repayait à
 * chaque suivant. Un agenda déjà moissonné doit coûter zéro.
 *
 * On compare sur l'adresse normalisée ET la commune : deux « 12 rue de la
 * Poste » dans deux villages ne sont pas le même endroit.
 */
async function lookupAdresseCache(
  adresse: string,
  commune?: string | null,
): Promise<Omit<GeoResult, 'approx'> | null> {
  const cle = nomCle(adresse)
  if (cle.length < 8) return null
  const motif = `%${cle.replace(/[%_]/g, ' ')}%`
  let q = supabaseAdmin.from('lieux')
    .select('nom, commune, adresse, lat, lng, place_id_google')
    .ilike('adresse', motif).not('lat', 'is', null).limit(6)
  if (commune) q = q.ilike('commune', commune)
  const { data } = await q
  const trouve = (data ?? [])[0] as CandidatLieu | undefined
  if (!trouve || trouve.lat == null) return null
  return {
    lat: trouve.lat, lng: trouve.lng,
    adresse: trouve.adresse ?? null,
    place_id_google: trouve.place_id_google ?? null,
  }
}

async function lookupLieuxCache(
  lieuNom: string,
  commune?: string | null,
  /**
   * CHERCHE-T-ON UNE COMMUNE, ET NON UN LIEU ?
   *
   * La recherche est volontairement LARGE : « Chez Milonga » doit retrouver
   * « Milonga Cave », sinon on repart chez Google pour un endroit qu'on
   * connait par coeur. Cette largeur est bonne — pour un nom de lieu.
   *
   * Avec un nom de COMMUNE, elle devient un piege. Des dizaines de fiches
   * portent le nom du village dans le leur : « La Bougeotte - Ganges 34 »,
   * « Cinema l'arc en ciel, Ganges ». Toutes contiennent « ganges », donc
   * toutes sont candidates — et la regle finale, qui prefere « la fiche la
   * plus precise, celle qui porte une adresse », donne la victoire au
   * commerce a tous les coups, puisque la commune nue n'a jamais d'adresse.
   *
   * Resultat mesure le 21/09/2026 : toute annonce disant seulement « a
   * Ganges » atterrissait Place Fabre Olivet, chez La Bougeotte. « Laroque »
   * tombait a la salle de la mairie, « Le Vigan » a la mediatheque. C'est le
   * cas le plus FREQUENT d'une annonce de village, et l'erreur ne se voyait
   * pas : une punaise bien posee, une adresse credible, le bon village.
   *
   * Quand ce drapeau est leve, seul un lieu qui EST cette commune repond.
   * « La Bougeotte a Ganges » n'est pas Ganges.
   */
  chercheUneCommune = false,
  /** L'adresse donnée par l'annonce, quand il y en a une. */
  adresseAnnonce?: string | null,
): Promise<Omit<GeoResult, 'approx'> | null> {
  const cle = nomCle(lieuNom)
  if (cle.length < 5 || NOMS_TROP_COURANTS.has(cle)) return null

  // Deux requêtes plutôt qu'un `.or()` : les virgules et parenthèses d'un nom
  // de lieu cassent la syntaxe de filtre de PostgREST (piège documenté sur ce
  // projet), et un nom de commerce en contient souvent.
  /*
   * Quarante candidats, pas douze.
   *
   * La base a longtemps porte le meme endroit en dizaines d'exemplaires —
   * « Stade d'Aveze » 48 fois. La requete n'en lisait que douze, et il
   * suffisait qu'un intrus se glisse parmi eux pour que la regle des 2 km
   * juge l'ensemble ambigu et renvoie tout le monde chez Google. Le plafond
   * ne protegeait rien : un nom de lieu ne ramene jamais des milliers de
   * lignes.
   */
  const motif = `%${cle.replace(/[%_]/g, ' ')}%`
  const [lieuxRes, etabsRes] = await Promise.all([
    supabaseAdmin.from('lieux')
      .select('nom, commune, adresse, lat, lng, place_id_google')
      .ilike('nom', motif).not('lat', 'is', null).limit(40),
    supabaseAdmin.from('etablissements')
      .select('nom, commune, adresse, lat, lng, place_id_google')
      .ilike('nom', motif).not('lat', 'is', null).limit(40),
  ])

  const candidats: CandidatLieu[] = [
    ...((lieuxRes.data ?? []) as CandidatLieu[]),
    /*
     * On GARDE le place_id de l'etablissement.
     *
     * Il etait force a null : l'app retrouvait le bon commerce, prenait ses
     * coordonnees exactes, puis jetait sa carte d'identite — et affichait
     * « Localisation approximative » sur une punaise parfaitement posee. Vu le
     * 16/09/2026 sur « Le Pradet » a Saint-Hippolyte-du-Fort.
     */
    ...((etabsRes.data ?? []) as CandidatLieu[]),
  ]
  if (!candidats.length) return null

  // Le `%...%` est large exprès — il rattrape « Milonga Cave » depuis
  // « Milonga ». On resserre ici : l'un des deux noms doit contenir l'autre
  // une fois normalisé, sinon « Le Cros » attraperait « Le Crosson ».
  let retenus = candidats.filter(c => {
    const k = nomCle(c.nom)
    if (k.length < 3) return false
    // Une commune ne se reconnait que dans son propre nom.
    if (chercheUneCommune) return k === cle
    return k.includes(cle) || cle.includes(k)
  })
  if (!retenus.length) return null

  // La commune ne sert pas à trouver, elle sert à écarter.
  if (communesVoulues(commune).length) {
    const dedans = retenus.filter(c => {
      // Une fiche sans commune se lit dans son adresse. Sans ça elle passait
      // toujours : « L'Art de Vivre » de Ganges retrouvait son homonyme du
      // Pont-de-Montvert, à 48 km.
      const sienne = c.commune || communeDepuisAdresse(c.adresse)
      return !sienne || memeCommune(sienne, commune)
    })
    if (!dedans.length) return null
    retenus = dedans
  }

  // Une adresse a été donnée : le lieu retenu doit être dans CETTE rue. Un
  // nom reconnu ne l'emporte pas sur l'adresse de l'annonce (« ArteMiss, 18
  // rue des Casernes » ne va pas avenue Sergent-Triaire). Un candidat sans
  // adresse ne se contrôle pas : il reste.
  const adresseVoulue = (adresseAnnonce ?? '').trim()
  if (ressembleAUneAdresse(adresseVoulue)) {
    const memeRue = retenus.filter(c => !c.adresse || porteLaRue({ adresse: c.adresse } as ResultatGoogle, adresseVoulue))
    if (!memeRue.length) return null
    retenus = memeRue
  }

  // Plusieurs endroits distincts portent ce nom : on ne tranche pas.
  for (let i = 0; i < retenus.length; i++) {
    for (let j = i + 1; j < retenus.length; j++) {
      if (ecartKm(retenus[i], retenus[j]) > 2) return null
    }
  }

  // À nom égal, la fiche ÉTABLISSEMENT gagne, puis celle qui porte une
  // adresse. Les lieux viennent du géocodage des annonces et peuvent être
  // faux ; le commerce, lui, est posé sur sa fiche Google. Sans cette
  // priorité, « Afrobar 224 » retrouvait son propre lieu mal placé (sur les
  // Halles, à 390 m) avant la fiche du bar, et l'erreur se recopiait.
  const nbLieux = (lieuxRes.data ?? []).length
  const estEtab = (c: CandidatLieu) => candidats.indexOf(c) >= nbLieux
  const gagnant = retenus.find(c => estEtab(c) && c.adresse)
    ?? retenus.find(estEtab)
    ?? retenus.find(c => c.adresse)
    ?? retenus[0]
  if (gagnant.lat == null) return null

  return {
    place_id_google: gagnant.place_id_google ?? null,
    lat: gagnant.lat,
    lng: gagnant.lng,
    adresse: gagnant.adresse ?? null,
  }
}

/**
 * `indiceGeo` : le contexte géographique ajouté à la requête Google, à la place
 * du simple "France".
 *
 * Google Places Text Search ignore les paramètres de biais géographique
 * (`locationbias`, `location`+`radius`) — vérifié, aucun effet. Le seul levier
 * qui fonctionne est l'indice dans la chaîne de recherche elle-même. Sans lui,
 * une commune au nom répandu part au hasard : "Bréau" (à 12 km) tombe sur son
 * homonyme de Seine-et-Marne, à 518 km, et le filtre de zone écarte alors un
 * lieu parfaitement local.
 *
 * Mesuré sur 12 communes du secteur : "Cévennes, France" corrige 4 erreurs
 * (Bréau 518→12, Saint-Martial 113→12, Rochegude 96→58, Ste Claire 434→0) sans
 * dégrader un seul cas qui marchait déjà.
 *
 * Défaut "France" = comportement historique, conservé pour les appelants qui
 * ne visent pas notre secteur.
 */

/**
 * Le repère du secteur, à passer par TOUT chemin qui écrit un événement chez
 * nous : WhatsApp, Signal et le formulaire.
 *
 * Il vivait en clair dans `processMessage` seul, et les deux autres chemins
 * géocodaient donc avec « France ». Une constante partagée pour qu'un
 * quatrième chemin ne reparte pas sans, et pour n'avoir qu'un endroit à
 * changer si la zone déménage.
 */
export const INDICE_GEO_SECTEUR = 'Cevennes, Gard, Herault, France'

/**
 * La commune lue dans l'adresse rendue par Google, ou `null`.
 *
 * POURQUOI ELLE PRIME SUR CELLE DU MODELE. Jusqu'ici deux champs d'origines
 * differentes cohabitaient sans jamais se parler : `commune` venait de ce que
 * le modele avait lu sur l'affiche, `adresse` de ce que Google avait trouve.
 * Quand les deux divergeaient, rien ne tranchait.
 *
 * ELLE NE SERT QUE DE BOUCHE-TROU, ET C'EST DELIBERE. Quand le modele a lu une
 * commune, on la garde, meme si l'adresse en dit une autre. Mesure sur les 843
 * fiches existantes : 176 communes ne concordent pas avec leur propre adresse,
 * et dans ces desaccords c'est le plus souvent L'ADRESSE qui a tort — « Theatre
 * de Verduire, Saint-Jean-du-Gard » geocode a Ales, « Marche couvert,
 * Saint-Jean-du-Gard » a Fabregues, « Foyer Albouy, Le Vigan » a Beziers.
 * Preferer l'adresse aurait remplace la seule valeur juste par la fausse.
 *
 * Un desaccord n'est donc pas une commune a corriger : c'est le signe que le
 * POINT est douteux. On ne se sert de l'adresse que la ou il n'y avait rien.
 *
 * Format attendu : « ..., 34190 Ganges, France ». Sans code postal — donc sur
 * un geocodage approximatif, ou une adresse etrangere — on rend `null` et
 * l'appelant garde ce qu'il avait.
 */
export function communeDepuisAdresse(adresse: string | null | undefined): string | null {
  if (!adresse) return null
  const m = adresse.match(/\b\d{5}\s+([^,]+)/)
  const commune = m?.[1]?.trim()
  return commune && commune.length > 1 ? commune : null
}
/**
 * Vrai si ce texte ressemble a une ADRESSE POSTALE et pas a un nom de lieu.
 *
 * Le critere est un numero de voie, ou un mot de voie. « 70 route du Pont de
 * la Croix » oui ; « Salle des fetes » non. On reste volontairement strict :
 * une adresse douteuse envoyee a Google rend un point douteux, et un point
 * faux est pire qu'un point approximatif — il a l'air juste.
 */
const MOTS_DE_VOIE = /\b(rue|route|avenue|av\.|bd|boulevard|chemin|impasse|place|allée|allee|quai|faubourg|lotissement|hameau|mas|domaine|zone|za|zi|lieu-dit|lieudit)\b/i
export function ressembleAUneAdresse(t: string | null | undefined): boolean {
  const v = (t ?? '').trim()
  if (v.length < 6) return false
  if (/^\d{1,4}\s*(bis|ter)?\s*[,\s]/i.test(v)) return true
  return MOTS_DE_VOIE.test(v)
}

export async function geocodeWithGoogle(
  lieuNom: string | null,
  commune?: string | null,
  opts: { indiceGeo?: string | null; adresse?: string | null; codePostal?: string | null } = {},
): Promise<GeoResult> {
  const indice = opts.indiceGeo?.trim() || 'France'

  /*
   * L'ADRESSE POSTALE EST TRANSMISE — c'est le signal le plus precis qu'on ait.
   *
   * Elle n'etait tout simplement pas transmise : on interrogeait Google avec
   * le nom du lieu et la commune, et rien d'autre. Quand une annonce ne donne
   * PAS de nom de lieu mais une adresse — « vide-maison, 70 route du Pont de
   * la Croix, 30120 Le Vigan » — on retombait sur la branche « commune
   * seule », c'est-a-dire le centre du village avec un decalage aleatoire.
   * La punaise se posait a plusieurs centaines de metres de la maison, et
   * l'adresse disparaissait de la fiche. Constate le 20/09/2026.
   *
   * Le code postal entre dans la requete quand on l'a : il tranche entre deux
   * communes homonymes mieux que n'importe quel repere regional.
   */
  /*
   * L'ORDRE : TOUT CE QUI EST CHEZ NOUS AVANT GOOGLE.
   *
   * L'adresse passait à Google AVANT que le nom ne soit cherché dans la base.
   * « Afrobar 224, 17 cours de la République » avait pourtant sa fiche
   * commerce, exacte, en base : on a payé un appel pour un point faux.
   * Désormais : adresse connue, puis nom connu (fiches commerces comprises),
   * et seulement ensuite Google — adresse puis nom, chaque réponse contrôlée.
   */
  const adresse = (opts.adresse ?? '').trim()
  const avecAdresse = ressembleAUneAdresse(adresse)

  // a. Cette adresse, déjà chez nous ?
  if (avecAdresse) {
    const connue = await lookupAdresseCache(adresse, commune)
    if (connue && connue.lat != null) return { ...connue, approx: false }
  }

  // b. Ce nom, déjà chez nous ? → ZERO appel Google
  if (lieuNom) {
    const cached = await lookupLieuxCache(lieuNom, commune, false, adresse)
    if (cached && cached.lat != null) return { ...cached, approx: false }
  }

  // c. Google sur l'adresse : la rue rendue doit être la rue demandée, dans
  //    la bonne commune. Sinon on n'en veut pas.
  if (avecAdresse) {
    const bonneRue = (r: ResultatGoogle) => porteLaRue(r, adresse) && dansLaCommune(r, commune)
    const q = [adresse, opts.codePostal, commune, indice].filter(Boolean).join(', ')
    const precis = await textsearch(q, bonneRue)
    if (precis) return { ...precis, approx: false }
    // Le numéro égare Text Search, qui cherche des lieux : la rue seule lui
    // fait rendre la voie elle-même. Un point dans la bonne rue vaut mieux
    // que le centre du village.
    const rue = rueSeule(adresse)
    if (rue && rue !== adresse) {
      const voie = await textsearch([rue, opts.codePostal, commune, indice].filter(Boolean).join(', '), bonneRue)
      if (voie) return { ...voie, approx: false }
    }
  }

  // d. Google sur le nom : le lieu rendu doit être dans la commune demandée
  //    — et dans la rue de l'annonce quand elle en donne une.
  if (lieuNom) {
    const q = [lieuNom, commune, indice].filter(Boolean).join(', ')
    const result = await textsearch(q, r => dansLaCommune(r, commune) && (!avecAdresse || porteLaRue(r, adresse)))
    if (result) return { ...result, approx: false }
  }

  // 2. Commune seule → coords approximatives centrées sur la commune
  if (commune) {
    // Cache hit sur une commune déjà connue
    const cachedCommune = await lookupLieuxCache(commune, null, true)
    if (cachedCommune && cachedCommune.lat != null) {
      return {
        place_id_google: null,
        lat: cachedCommune.lat + randOffset(),
        lng: cachedCommune.lng! + randOffset(),
        adresse: null,
        approx: true,
      }
    }
    // Sinon Google
    const result = await textsearch(commune + ', ' + indice)
    if (result) return {
      place_id_google: null,
      lat: result.lat! + randOffset(),
      lng: result.lng! + randOffset(),
      adresse: null,
      approx: true,
    }
  }

  // 3. Rien trouvé → pas de coords
  return { place_id_google: null, lat: null, lng: null, adresse: null, approx: false }
}

interface StatutParams {
  categorie: string | null | undefined
  date_debut: string | null | undefined
  description: string | null | undefined
  hasGeo: boolean
  commune: string | null | undefined
  adresse: string | null | undefined
}

export type Statut = 'publie' | 'en_attente' | 'rejete'

export function calcStatut(p: StatutParams): Statut {
  const hasDate = !!p.date_debut
  const hasLieu = p.hasGeo // vrai pour coords exactes ET approximatives

  // Rejeté si pas de date ET pas de lieu
  if (!hasDate && !hasLieu) return 'rejete'

  const hasCategorie = !!p.categorie && p.categorie !== ''
  const hasDescription = !!p.description && p.description.trim().length >= 10

  if (hasDate && hasLieu && hasCategorie && hasDescription) return 'publie'
  return 'en_attente'
}
