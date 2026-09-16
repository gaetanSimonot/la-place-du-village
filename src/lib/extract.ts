import Anthropic from '@anthropic-ai/sdk'
import { getPrompt } from './prompts-ia'
import { safeJsonParse } from './safeJsonParse'

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

export async function extractWithClaude(text: string | null, imageBase64?: string, imageMimeType?: string): Promise<ExtractedData> {
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const systemPrompt = await getPrompt('extract_single', { today })

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

export async function extractMultipleWithClaude(text: string | null, imageBase64?: string, imageMimeType?: string): Promise<ExtractedData[]> {
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const systemPrompt = await getPrompt('extract_multiple', { today })

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

async function textsearch(query: string): Promise<Omit<GeoResult, 'approx'> | null> {
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${process.env.GOOGLE_PLACES_KEY}`
  const res = await fetch(url)
  const data = await res.json()
  if (data.results?.[0]) {
    const p = data.results[0]
    return {
      place_id_google: p.place_id ?? null,
      lat: p.geometry?.location?.lat ?? null,
      lng: p.geometry?.location?.lng ?? null,
      adresse: p.formatted_address ?? null,
    }
  }
  return null
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
async function lookupLieuxCache(lieuNom: string, commune?: string | null): Promise<Omit<GeoResult, 'approx'> | null> {
  const cle = nomCle(lieuNom)
  if (cle.length < 5 || NOMS_TROP_COURANTS.has(cle)) return null

  // Deux requêtes plutôt qu'un `.or()` : les virgules et parenthèses d'un nom
  // de lieu cassent la syntaxe de filtre de PostgREST (piège documenté sur ce
  // projet), et un nom de commerce en contient souvent.
  const motif = `%${cle.replace(/[%_]/g, ' ')}%`
  const [lieuxRes, etabsRes] = await Promise.all([
    supabaseAdmin.from('lieux')
      .select('nom, commune, adresse, lat, lng, place_id_google')
      .ilike('nom', motif).not('lat', 'is', null).limit(12),
    supabaseAdmin.from('etablissements')
      .select('nom, commune, adresse, lat, lng, place_id_google')
      .ilike('nom', motif).not('lat', 'is', null).limit(12),
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
    return k.length >= 3 && (k.includes(cle) || cle.includes(k))
  })
  if (!retenus.length) return null

  // La commune ne sert pas à trouver, elle sert à écarter.
  if (commune) {
    const ck = nomCle(commune)
    const memeCommune = retenus.filter(c => {
      const k = nomCle(c.commune)
      return !k || k === ck || k.includes(ck) || ck.includes(k)
    })
    if (!memeCommune.length) return null
    retenus = memeCommune
  }

  // Plusieurs endroits distincts portent ce nom : on ne tranche pas.
  for (let i = 0; i < retenus.length; i++) {
    for (let j = i + 1; j < retenus.length; j++) {
      if (ecartKm(retenus[i], retenus[j]) > 2) return null
    }
  }

  // À nom égal, la fiche la plus précise gagne : celle qui porte une adresse.
  const gagnant = retenus.find(c => c.adresse) ?? retenus[0]
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
 * Défaut "France" = comportement historique inchangé pour les appelants
 * existants (WhatsApp, Signal, formulaire).
 */
export async function geocodeWithGoogle(
  lieuNom: string | null,
  commune?: string | null,
  opts: { indiceGeo?: string | null } = {},
): Promise<GeoResult> {
  const indice = opts.indiceGeo?.trim() || 'France'
  // 1. Lieu précis + commune → DB-first puis Google
  if (lieuNom) {
    // Cache hit dans table lieux → ZERO appel Google
    const cached = await lookupLieuxCache(lieuNom, commune)
    if (cached && cached.lat != null) return { ...cached, approx: false }

    // Sinon Google textsearch
    const q = [lieuNom, commune, indice].filter(Boolean).join(', ')
    const result = await textsearch(q)
    if (result) return { ...result, approx: false }
  }

  // 2. Commune seule → coords approximatives centrées sur la commune
  if (commune) {
    // Cache hit sur une commune déjà connue
    const cachedCommune = await lookupLieuxCache(commune)
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
