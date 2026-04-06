import Anthropic from '@anthropic-ai/sdk'

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

  const systemPrompt = `Tu es un assistant qui extrait des informations d'événements locaux.
Aujourd'hui nous sommes le ${today}. Utilise cette date pour résoudre toute référence relative : "ce samedi", "le 15", "ce mois-ci", "la semaine prochaine", "demain", etc.
Contexte géographique : tous les événements ont lieu dans l'Hérault (département 34), région de Ganges, sauf mention contraire explicite. Si une commune est ambiguë (ex: Cazilhac, Saint-Bauzille, etc.), privilégie toujours la commune de l'Hérault (34). Mets toujours "34" dans code_postal si aucun code n'est précisé.
Réponds UNIQUEMENT avec un JSON valide, sans markdown ni explication.
Structure attendue :
{
  "titre": "string",
  "description": "string",
  "date_debut": "YYYY-MM-DD ou null",
  "date_fin": "YYYY-MM-DD ou null",
  "heure": "HH:MM ou null",
  "categorie": "concert|theatre|sport|marche|atelier|fete|autre",
  "lieu_nom": "string ou null",
  "lieu_adresse": "string ou null",
  "commune": "string ou null",
  "code_postal": "string ou null",
  "prix": "string ou null",
  "contact": "string ou null",
  "organisateurs": "string ou null"
}`

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
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : ''
  const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  return JSON.parse(clean)
}

const randOffset = () => Math.random() * 0.004 - 0.002

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

export async function geocodeWithGoogle(lieuNom: string | null, commune?: string | null): Promise<GeoResult> {
  // 1. Lieu précis + commune → coords exactes
  if (lieuNom) {
    const query = [lieuNom, commune, 'France'].filter(Boolean).join(', ')
    const result = await textsearch(query)
    if (result) return { ...result, approx: false }
  }

  // 2. Commune seule → coords approximatives centrées sur la commune
  if (commune) {
    const result = await textsearch(commune + ', France')
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
