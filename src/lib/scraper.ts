import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { geocodeWithGoogle, calcStatut } from './extract'
import { checkDoublon } from './checkDoublon'
import { trouverOuCreerLieu } from './lieuxResolve'
import { territoireParId, territoireDuPoint, indiceGeoDe } from './territoires'
import { getPrompt } from './prompts-ia'
import { safeJsonParse } from './safeJsonParse'
import { scrapeRecurrentSource, type ScrapeRecurrentResult } from './scraper-recurrent'
import { scrapeStructure, type ScrapeStructureResult } from './scraper-structure'
import { explorerSource } from './sourceDecouverte'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Client service role pour les inserts (contourne RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScrapeEventItem {
  titre:  string
  statut: string
  doublon: boolean
}

export interface ScrapeResult {
  sourceId:   string
  sourceName: string
  trouves:    number
  doublons:   number
  inseres:    number
  erreur?:    string
  evenements: ScrapeEventItem[]
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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


// ── Extraction des événements par Claude ──────────────────────────────────────

async function extractEventsFromPage(pageText: string, sourceUrl: string): Promise<ScrapedEvent[]> {
  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  const systemPrompt = await getPrompt('scrape', { today })

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 16384,
    temperature: 0,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `Source : ${sourceUrl}\n\n${pageText}`,
    }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : '[]'
  const parsed = safeJsonParse<unknown>(raw)
  if (parsed == null) return []
  return Array.isArray(parsed) ? parsed as ScrapedEvent[] : []
}

// ── Point d'entrée principal ──────────────────────────────────────────────────

export async function scrapeSource(
  sourceId: string,
  opts: { dryRun?: boolean } = {},
): Promise<ScrapeResult | ScrapeRecurrentResult | ScrapeStructureResult> {
  // 1. Charger la source
  const { data: source, error: srcErr } = await supabaseAdmin
    .from('sources')
    .select('*')
    .eq('id', sourceId)
    .single()

  if (srcErr || !source) {
    return { sourceId, sourceName: '?', trouves: 0, doublons: 0, inseres: 0, erreur: 'Source introuvable', evenements: [] }
  }

  /*
   * LE TERRITOIRE DE LA SOURCE PRESUME, LA GEOGRAPHIE TRANCHE.
   *
   * Meme regle que les trois chemins d'ingestion. La presomption sert d'abord
   * au geocodage — qui n'avait AUCUN repere ici, contrairement aux autres
   * chemins : « Breau » partait donc en Seine-et-Marne, a 518 km, et se
   * faisait ensuite refuser comme hors zone. Le defaut existait avant les
   * territoires ; il se corrige en meme temps.
   */
  const terrSource = await territoireParId(source.territoire_id)

  // 1bis. Aiguillage : une source « récurrente » (page de marchés…) ne contient
  // pas d'événements datés mais une table de récurrences. Pipeline dédié.
  if (source.type === 'recurrent') {
    return scrapeRecurrentSource(source, opts)
  }

  /*
   * 1quater. LA SOURCE PUBLIE-T-ELLE SES DONNÉES ELLE-MÊME ?
   *
   * Beaucoup d'agendas déposent un bloc schema.org/Event dans leurs pages :
   * titre, description entière, date AVEC l'heure, adresse postale découpée,
   * tarif et image. Quand c'est le cas, faire relire la page par un modèle
   * coûte un appel pour un résultat moins bon — et fait perdre les images,
   * que l'aplatissement en texte efface.
   *
   * La détection est automatique et ne demande aucun réglage : une page qui
   * ne publie rien de structuré retombe sur la lecture par modèle, ci-dessous.
   */
  const piste = await explorerSource(source.url)
  if (piste.agendas.length) {
    /*
     * MODE DOMAINE. On peut désormais donner « ville-pau.fr » au lieu de
     * chercher soi-même la bonne page : l'exploration lit le menu, les
     * chemins habituels et les liens, et rend la meilleure page d'agenda.
     *
     * La page DÉSIGNÉE par l'admin reste prioritaire quand elle vaut quelque
     * chose — quelqu'un l'a choisie, ce n'est pas à nous de la corriger.
     */
    const cible = piste.agendas[0].url
    /*
     * On moissonne aussi les autres pages du même site.
     *
     * Beaucoup d'agendas n'affichent qu'un échantillon à la racine et rangent
     * le reste par rubrique : concerts, festivals, patrimoine. S'arrêter à la
     * première page laissait les deux tiers du site sur la table. Le
     * dédoublonnage fait le ménage quand les rubriques se recoupent.
     */
    const enPlus = piste.agendas.slice(1, 14).map(a => a.url)
    return scrapeStructure({ ...source, url: cible, pagesEnPlus: enPlus }, opts)
  }

  // 1ter. Le pipeline classique ci-dessous écrit au fil de l'eau : il n'a pas
  // de mode aperçu. On refuse explicitement plutôt que d'ignorer le drapeau et
  // d'écrire alors que l'appelant croyait ne rien risquer.
  if (opts.dryRun) {
    return {
      sourceId, sourceName: source.nom, trouves: 0, doublons: 0, inseres: 0,
      erreur: 'L\'aperçu n\'existe que pour les sources récurrentes. Cette source écrit directement en base.',
      evenements: [],
    }
  }

  let trouves  = 0
  let doublons = 0
  let inseres  = 0
  let erreur: string | undefined
  const evenements: ScrapeEventItem[] = []

  try {
    // 2. Récupérer la page via Jina Reader (gère le JS-rendering)
    const jinaUrl = `https://r.jina.ai/${source.url}`
    const res = await fetch(jinaUrl, {
      headers: {
        'Accept': 'text/plain',
        'X-No-Cache': 'true',
      },
    })
    if (!res.ok) throw new Error(`Jina HTTP ${res.status}`)
    const pageText = (await res.text()).slice(0, 40000)

    // 3. Extraire via Claude (texte déjà propre, pas besoin de cleanHtml)
    const events   = await extractEventsFromPage(pageText, source.url)
    trouves = events.length

    // 4. Traiter chaque événement
    for (const evt of events) {
      if (!evt.titre?.trim()) continue

      // Vérifier doublon via Claude
      // La dedup se fait DANS le territoire : sans ca les evenements d'une
      // ville occupent des places dans la fenetre de comparaison de l'autre,
      // et un vrai doublon peut en sortir.
      let terrEvt = terrSource

      const check = await checkDoublon({
        titre:       evt.titre,
        date_debut:  evt.date_debut,
        commune:     evt.commune,
        lieu_nom:    evt.lieu_nom,
        description: evt.description,
        territoire_id: terrEvt?.id ?? null,
      })

      if (check.doublon) {
        doublons++
        evenements.push({ titre: evt.titre, statut: 'archive', doublon: true })
        await supabaseAdmin.from('evenements').insert({
          titre:            evt.titre,
          description:      evt.description,
          date_debut:       evt.date_debut,
          date_fin:         evt.date_fin,
          heure:            evt.heure,
          categorie:        evt.categorie ?? 'autre',
          categories:       [evt.categorie ?? 'autre'],
          statut:           'archive',
          lieu_id:          null,
          source:           'scrape',
          scrape_source_id: sourceId,
          ...(terrEvt ? { territoire_id: terrEvt.id } : {}),
        })
        continue
      }

      // Géocoder
      let lieuId: string | null = null
      if (evt.lieu_nom || evt.commune) {
        const geo = await geocodeWithGoogle(evt.lieu_nom, evt.commune, { indiceGeo: indiceGeoDe(terrSource) })

        // Hors de TOUTES les zones : refus, comme avant. Dedans : c'est le
        // point qui range, pas la source.
        if (geo.lat != null && geo.lng != null) {
          const arbitrage = await territoireDuPoint(geo.lat, geo.lng)
          if (!arbitrage.territoire) {
            evenements.push({ titre: evt.titre, statut: 'hors_zone', doublon: false })
            continue
          }
          terrEvt = arbitrage.territoire
        }

        /*
         * CHERCHER AVANT DE CREER — comme les trois autres chemins.
         *
         * Celui-ci faisait un INSERT brut : chaque evenement fabriquait sa
         * propre punaise, meme au meme endroit. « Stade d'Aveze » a fini en
         * 48 exemplaires, tous avec le MEME identifiant Google. C'etait le
         * dernier chemin a echapper au point d'entree commun.
         */
        const lieu = await trouverOuCreerLieu(evt.lieu_nom ?? evt.commune ?? '', evt.commune, {
          lat: geo.lat, lng: geo.lng,
          adresse: geo.adresse ?? null,
          place_id_google: geo.place_id_google,
          code_postal: evt.code_postal ?? null,
          territoire_id: terrEvt?.id ?? null,
        })
        lieuId = lieu.id
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

      // Statut final
      const finalStatut = check.publier
        ? (statut === 'rejete' ? 'en_attente' : statut)
        : 'a_verifier'

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
          categories:       [evt.categorie ?? 'autre'],
          statut:           finalStatut,
          lieu_id:          lieuId,
          prix:             evt.prix,
          contact:          evt.contact,
          organisateurs:    evt.organisateurs,
          source:           'scrape',
          scrape_source_id: sourceId,
          ...(terrEvt ? { territoire_id: terrEvt.id } : {}),
        })

      if (!evtErr) {
        inseres++
        evenements.push({ titre: evt.titre, statut: finalStatut, doublon: false })
      }
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

  return { sourceId, sourceName: source.nom, trouves, doublons, inseres, erreur, evenements }
}
