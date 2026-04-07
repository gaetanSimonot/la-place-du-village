import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { geocodeWithGoogle, calcStatut } from './extract'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Client service role pour les inserts (contourne RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScrapeResult {
  sourceId:  string
  sourceName: string
  trouves:   number
  doublons:  number
  inseres:   number
  erreur?:   string
}

interface ScrapedEvent {
  titre:         string
  description:   string | null
  date_debut:    string | null   // YYYY-MM-DD
  date_fin:      string | null
  heure:         string | null   // HH:MM
  categorie:     string
  lieu_nom:      string | null
  commune:       string | null
  code_postal:   string | null
  prix:          string | null
  contact:       string | null
  organisateurs: string | null
}

// ── Nettoyage HTML → texte ────────────────────────────────────────────────────

function cleanHtml(html: string): string {
  return html
    // Supprimer scripts, styles, nav, header, footer, aside
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    // Remplacer balises de structure par newlines
    .replace(/<(div|section|article|li|tr|td|th|h[1-6]|p|br)[^>]*>/gi, '\n')
    // Supprimer toutes les autres balises
    .replace(/<[^>]+>/g, '')
    // Décoder entités HTML courantes
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    // Normaliser les espaces
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    // Limiter à 40 000 chars (bien dans la fenêtre contexte de Claude)
    .slice(0, 40000)
}

// ── Similarité Jaccard sur les mots (dédoublonnage) ──────────────────────────

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // accents
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalize(a).split(' ').filter(w => w.length > 2))
  const wordsB = new Set(normalize(b).split(' ').filter(w => w.length > 2))
  if (wordsA.size === 0 && wordsB.size === 0) return 1
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length
  const union = new Set([...wordsA, ...wordsB]).size
  return union === 0 ? 0 : intersection / union
}

// ── Vérification doublon en base ──────────────────────────────────────────────

async function isDuplicate(event: ScrapedEvent): Promise<boolean> {
  if (!event.titre) return false

  // Chercher les événements avec la même date dans la base
  let query = supabaseAdmin
    .from('evenements')
    .select('titre')
    .not('titre', 'is', null)

  if (event.date_debut) {
    query = query.eq('date_debut', event.date_debut)
  }

  const { data: candidates } = await query.limit(200)
  if (!candidates?.length) return false

  return candidates.some(c => jaccardSimilarity(c.titre, event.titre) >= 0.75)
}

// ── Extraction des événements par Claude ──────────────────────────────────────

async function extractEventsFromPage(pageText: string, sourceUrl: string): Promise<ScrapedEvent[]> {
  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  const systemPrompt = `Tu analyses le contenu textuel d'une page web d'agenda d'événements locaux dans l'Hérault (34), France.
Aujourd'hui : ${today}.
Extrait TOUS les événements présents dans ce texte.
Réponds UNIQUEMENT avec un tableau JSON valide (sans markdown).
Si aucun événement, retourne [].
Structure de chaque objet :
{
  "titre": "string",
  "description": "string ou null",
  "date_debut": "YYYY-MM-DD ou null",
  "date_fin": "YYYY-MM-DD ou null",
  "heure": "HH:MM ou null",
  "categorie": "concert|theatre|sport|marche|atelier|fete|autre",
  "lieu_nom": "string ou null",
  "commune": "string ou null",
  "code_postal": "34xxx ou null",
  "prix": "string ou null",
  "contact": "string ou null",
  "organisateurs": "string ou null"
}`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `Source : ${sourceUrl}\n\n${pageText}`,
    }],
  })

  const raw   = response.content[0].type === 'text' ? response.content[0].text : '[]'
  const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

  const parsed = JSON.parse(clean)
  return Array.isArray(parsed) ? parsed : []
}

// ── Point d'entrée principal ──────────────────────────────────────────────────

export async function scrapeSource(sourceId: string): Promise<ScrapeResult> {
  // 1. Charger la source
  const { data: source, error: srcErr } = await supabaseAdmin
    .from('sources')
    .select('*')
    .eq('id', sourceId)
    .single()

  if (srcErr || !source) {
    return { sourceId, sourceName: '?', trouves: 0, doublons: 0, inseres: 0, erreur: 'Source introuvable' }
  }

  let trouves  = 0
  let doublons = 0
  let inseres  = 0
  let erreur: string | undefined

  try {
    // 2. Récupérer la page
    const res = await fetch(source.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PDV-Scraper/1.0)' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()

    // 3. Nettoyer et extraire via Claude
    const pageText = cleanHtml(html)
    const events   = await extractEventsFromPage(pageText, source.url)
    trouves = events.length

    // 4. Traiter chaque événement
    for (const evt of events) {
      if (!evt.titre?.trim()) continue

      // Vérifier doublon
      const dup = await isDuplicate(evt)
      if (dup) { doublons++; continue }

      // Géocoder
      let lieuId: string | null = null
      if (evt.lieu_nom || evt.commune) {
        const geo = await geocodeWithGoogle(evt.lieu_nom, evt.commune)

        if (evt.lieu_nom || evt.commune) {
          const { data: lieu } = await supabaseAdmin
            .from('lieux')
            .insert({
              nom:             evt.lieu_nom ?? evt.commune,
              adresse:         geo.adresse ?? null,
              lat:             geo.lat,
              lng:             geo.lng,
              place_id_google: geo.place_id_google,
              commune:         evt.commune,
              code_postal:     evt.code_postal,
            })
            .select('id')
            .single()
          lieuId = lieu?.id ?? null
        }
      }

      // Calculer statut (toujours en_attente pour les scrapes)
      const statut = calcStatut({
        categorie:   evt.categorie,
        date_debut:  evt.date_debut,
        description: evt.description,
        hasGeo:      false, // forcer en_attente — validation admin requise
        commune:     evt.commune,
        adresse:     null,
      })

      // Insérer l'événement
      const { error: evtErr } = await supabaseAdmin
        .from('evenements')
        .insert({
          titre:            evt.titre,
          description:      evt.description,
          date_debut:       evt.date_debut,
          date_fin:         evt.date_fin,
          heure:            evt.heure,
          categorie:        evt.categorie ?? 'autre',
          statut:           statut === 'rejete' ? 'en_attente' : statut, // jamais rejeté auto
          lieu_id:          lieuId,
          prix:             evt.prix,
          contact:          evt.contact,
          organisateurs:    evt.organisateurs,
          source:           'scrape',
          scrape_source_id: sourceId,
        })

      if (!evtErr) inseres++
    }

    // 5. Mettre à jour dernier_scrape
    await supabaseAdmin
      .from('sources')
      .update({ dernier_scrape: new Date().toISOString() })
      .eq('id', sourceId)

  } catch (e: unknown) {
    erreur = e instanceof Error ? e.message : 'Erreur inconnue'
  }

  // 6. Logger
  await supabaseAdmin
    .from('scrape_logs')
    .insert({ source_id: sourceId, trouves, doublons, inseres, erreur })

  return { sourceId, sourceName: source.nom, trouves, doublons, inseres, erreur }
}
