/**
 * Scraping de sources RÉCURRENTES (marchés hebdomadaires, permanences…).
 *
 * Pourquoi un pipeline séparé du scraper classique : une page de marchés ne
 * contient aucune date. C'est une table de récurrences. Le pipeline daté
 * habituel oblige le modèle à inventer des dates, et chaque nouveau scrape
 * réinvente une semaine différente → doublons garantis.
 *
 * Ici on extrait des RÈGLES (« Sumène, mercredi, toute l'année »), puis on
 * matérialise les N prochaines semaines. Chaque occurrence porte une
 * `serie_cle` stable, et un index unique (serie_cle, date_debut) rend le
 * doublon impossible en base. Conséquence : ce scrape est idempotent. On peut
 * le relancer dix fois de suite, seules les dates nouvelles s'ajoutent.
 *
 * Aucun appel de dédup par IA : c'est Postgres qui tranche, pas un modèle.
 */

import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from './supabase-admin'
import { geocodeWithGoogle } from './extract'
import { checkZone } from './checkZone'
import { getPrompt } from './prompts-ia'
import { safeJsonParse } from './safeJsonParse'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const HORIZON_DEFAUT = 42          // 6 semaines
const CONCURRENCE_GEOCODE = 5

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'] as const

// ── Types ─────────────────────────────────────────────────────────────────────

/** Une règle de récurrence telle que le modèle la renvoie. */
export interface RegleRecurrente {
  cle:              string
  titre:            string
  description:      string | null
  commune:          string | null
  lieu_nom:         string | null
  jour:             string          // 'lundi'…'dimanche' | 'tous_les_jours'
  heure:            string | null   // "HH:MM"
  periode_debut:    string | null   // "MM-DD"
  periode_fin:      string | null   // "MM-DD"
  periode_texte:    string | null
  regulier:         boolean
  note_irreguliere: string | null
}

/** Ce qu'on rapporte à l'admin pour chaque règle, avant ou après écriture. */
export interface RegleRapport {
  cle:           string
  titre:         string
  description:   string | null
  commune:       string | null
  lieu_nom:      string | null
  jour:          string
  heure:         string | null
  periode_texte: string | null
  serie_cle:     string
  /** Sort de la règle : retenue, écartée, ou à traiter à la main. */
  verdict:       'retenue' | 'hors_zone' | 'sans_lieu' | 'irreguliere'
  distance_km:   number | null
  commentaire:   string | null
  occurrences:   string[]   // dates YYYY-MM-DD qui seraient (ou ont été) créées
  inserees:      number     // 0 en aperçu
}

export interface ScrapeRecurrentResult {
  mode:       'recurrent'
  sourceId:   string
  sourceName: string
  dryRun:     boolean
  erreur?:    string
  /** Compatibilité avec l'affichage historique du rapport de scrape. */
  trouves:    number
  doublons:   number
  inseres:    number
  reglages: {
    rayon_km:      number | null
    horizon_jours: number
    publier_auto:  boolean
    statut_cible:  string
  }
  totaux: {
    regles_trouvees:      number
    regles_retenues:      number
    regles_hors_zone:     number
    regles_sans_lieu:     number
    regles_irregulieres:  number
    occurrences_prevues:  number
    occurrences_creees:   number
    occurrences_ignorees: number   // déjà en base — le verrou a fait son travail
  }
  regles: RegleRapport[]
}

// ── Dates ─────────────────────────────────────────────────────────────────────

/** Aujourd'hui vu de Paris, en YYYY-MM-DD. */
function aujourdhuiParis(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

/** Ajoute n jours à une date YYYY-MM-DD. Calcul en UTC midi → insensible au DST. */
function ajouteJours(dateISO: string, n: number): string {
  const d = new Date(dateISO + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function jourDeLaSemaine(dateISO: string): string {
  return JOURS[new Date(dateISO + 'T12:00:00Z').getUTCDay()]
}

/**
 * Une date tombe-t-elle dans la saison ? Les bornes sont des "MM-DD" sans
 * année, donc la fenêtre se répète chaque année. Le cas « novembre → mars »
 * (borne qui enjambe le nouvel an) est géré.
 */
export function dansLaPeriode(dateISO: string, debut: string | null, fin: string | null): boolean {
  if (!debut || !fin) return true
  const mmdd = dateISO.slice(5)
  return debut <= fin
    ? mmdd >= debut && mmdd <= fin
    : mmdd >= debut || mmdd <= fin      // saison à cheval sur deux années
}

/** Les dates des N prochains jours qui satisfont la règle. */
export function occurrences(regle: RegleRecurrente, horizonJours: number, depuis?: string): string[] {
  if (!regle.regulier) return []
  const debut = depuis ?? aujourdhuiParis()
  const jourVoulu = (regle.jour ?? '').toLowerCase().trim()
  const tousLesJours = jourVoulu === 'tous_les_jours'
  if (!tousLesJours && !JOURS.includes(jourVoulu as typeof JOURS[number])) return []

  const out: string[] = []
  for (let i = 0; i < horizonJours; i++) {
    const d = ajouteJours(debut, i)
    if (!tousLesJours && jourDeLaSemaine(d) !== jourVoulu) continue
    if (!dansLaPeriode(d, regle.periode_debut, regle.periode_fin)) continue
    out.push(d)
  }
  return out
}

// ── Divers ────────────────────────────────────────────────────────────────────

/** Exécute `fn` sur tous les items, `limite` en parallèle au maximum. */
async function mapLimit<T, R>(items: T[], limite: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let curseur = 0
  const worker = async () => {
    while (curseur < items.length) {
      const i = curseur++
      out[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, worker))
  return out
}

function normaliseHeure(h: string | null): string | null {
  if (!h) return null
  const m = /^(\d{1,2})[:h.]?(\d{2})?$/.exec(h.trim())
  if (!m) return null
  const hh = String(Math.min(23, parseInt(m[1], 10))).padStart(2, '0')
  const mm = String(Math.min(59, parseInt(m[2] ?? '0', 10))).padStart(2, '0')
  return `${hh}:${mm}`
}

function slug(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// ── Extraction des règles ─────────────────────────────────────────────────────

async function extraireRegles(pageText: string, sourceUrl: string): Promise<RegleRecurrente[]> {
  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  const systemPrompt = await getPrompt('scrape_recurrent', { today })

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 16384,
    temperature: 0,
    system: systemPrompt,
    messages: [{ role: 'user', content: `Source : ${sourceUrl}\n\n${pageText}` }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : '[]'
  const parsed = safeJsonParse<unknown>(raw)
  if (!Array.isArray(parsed)) return []

  // On ne garde que ce qui a au minimum un titre et un jour exploitables, et on
  // déduplique sur la clé : si le modèle a extrait deux fois la même entrée
  // (typiquement depuis la FAQ de bas de page), la seconde est écartée ici.
  const vues = new Set<string>()
  const regles: RegleRecurrente[] = []
  for (const r of parsed as RegleRecurrente[]) {
    if (!r || typeof r !== 'object') continue
    if (!r.titre?.trim()) continue
    const cle = slug(r.cle || `${r.commune ?? ''}-${r.jour ?? ''}`)
    if (!cle || vues.has(cle)) continue
    vues.add(cle)
    regles.push({
      ...r,
      cle,
      heure: normaliseHeure(r.heure),
      regulier: r.regulier !== false,
    })
  }
  return regles
}

// ── Lieux : on réutilise, on ne recrée pas ────────────────────────────────────

/**
 * Trouve le lieu existant correspondant, sinon le crée. Le scraper historique
 * faisait un INSERT sec à chaque passage : même marché, même place du village,
 * une nouvelle ligne `lieux` chaque semaine. D'où 767 lieux pour 528 events.
 */
async function trouveOuCreeLieu(
  nom: string,
  commune: string | null,
  geo: { lat: number | null; lng: number | null; adresse: string | null; place_id_google: string | null },
  dryRun: boolean,
): Promise<{ id: string | null; reutilise: boolean }> {
  // 1. Par place_id Google — l'identifiant le plus fiable
  if (geo.place_id_google) {
    const { data } = await supabaseAdmin
      .from('lieux').select('id').eq('place_id_google', geo.place_id_google).limit(1).maybeSingle()
    if (data?.id) return { id: data.id, reutilise: true }
  }

  // 2. Par nom + commune
  let q = supabaseAdmin.from('lieux').select('id').ilike('nom', nom).limit(1)
  if (commune) q = q.ilike('commune', commune)
  const { data: parNom } = await q.maybeSingle()
  if (parNom?.id) return { id: parNom.id, reutilise: true }

  if (dryRun) return { id: null, reutilise: false }

  const { data: cree } = await supabaseAdmin
    .from('lieux')
    .insert({
      nom,
      adresse:         geo.adresse ?? null,
      lat:             geo.lat,
      lng:             geo.lng,
      place_id_google: geo.place_id_google,
      commune,
    })
    .select('id')
    .single()
  return { id: cree?.id ?? null, reutilise: false }
}

// ── Point d'entrée ────────────────────────────────────────────────────────────

interface SourceRow {
  id: string
  nom: string
  url: string
  rayon_km?: number | null
  horizon_jours?: number | null
  publier_auto?: boolean | null
  /** Contexte ajouté aux requêtes de géocodage, ex "Cévennes, France". */
  indice_geo?: string | null
}

export async function scrapeRecurrentSource(
  source: SourceRow,
  opts: { dryRun?: boolean } = {},
): Promise<ScrapeRecurrentResult> {
  const dryRun = opts.dryRun === true
  const horizon = source.horizon_jours && source.horizon_jours > 0 ? source.horizon_jours : HORIZON_DEFAUT
  const statutCible = source.publier_auto ? 'publie' : 'en_attente'

  const base: ScrapeRecurrentResult = {
    mode: 'recurrent',
    sourceId: source.id,
    sourceName: source.nom,
    dryRun,
    trouves: 0, doublons: 0, inseres: 0,
    reglages: {
      rayon_km: source.rayon_km ?? null,
      horizon_jours: horizon,
      publier_auto: !!source.publier_auto,
      statut_cible: statutCible,
    },
    totaux: {
      regles_trouvees: 0, regles_retenues: 0, regles_hors_zone: 0,
      regles_sans_lieu: 0, regles_irregulieres: 0,
      occurrences_prevues: 0, occurrences_creees: 0, occurrences_ignorees: 0,
    },
    regles: [],
  }

  try {
    // 1. La page, via Jina Reader (gère le rendu JS)
    const res = await fetch(`https://r.jina.ai/${source.url}`, {
      headers: { Accept: 'text/plain', 'X-No-Cache': 'true' },
    })
    if (!res.ok) throw new Error(`Jina HTTP ${res.status}`)
    const pageText = (await res.text()).slice(0, 40000)

    // 2. Un SEUL appel au modèle, pour toute la page
    const regles = await extraireRegles(pageText, source.url)
    base.totaux.regles_trouvees = regles.length
    base.trouves = regles.length

    // 3. Géocodage en parallèle (5 à la fois). Le cache lieux de
    //    geocodeWithGoogle évite l'appel Google quand l'endroit est déjà connu.
    // `indiceGeo` : une page régionale ne cite que des communes du coin, mais
    // Google ne le sait pas. Sans indice, "Bréau" (12 km) part sur son homonyme
    // de Seine-et-Marne à 518 km et le filtre de zone écarte un marché local.
    const indice = source.indice_geo ?? null
    const geos = await mapLimit(regles, CONCURRENCE_GEOCODE, async (r) => {
      if (!r.lieu_nom && !r.commune) return null
      return geocodeWithGoogle(r.lieu_nom, r.commune, { indiceGeo: indice })
    })

    // 4. Chaque règle → verdict + occurrences
    const aInserer: Record<string, unknown>[] = []

    for (let i = 0; i < regles.length; i++) {
      const r = regles[i]
      const geo = geos[i]
      const serieCle = `marche:${r.cle}`

      const rapport: RegleRapport = {
        cle: r.cle,
        titre: r.titre,
        description: r.description ?? null,
        commune: r.commune ?? null,
        lieu_nom: r.lieu_nom ?? null,
        jour: r.jour,
        heure: r.heure,
        periode_texte: r.periode_texte ?? null,
        serie_cle: serieCle,
        verdict: 'retenue',
        distance_km: null,
        commentaire: null,
        occurrences: [],
        inserees: 0,
      }

      // 4a. Récurrence irrégulière → on n'invente rien, ça part en liste manuelle
      if (!r.regulier) {
        rapport.verdict = 'irreguliere'
        rapport.commentaire = r.note_irreguliere ?? 'récurrence irrégulière'
        base.totaux.regles_irregulieres++
        base.regles.push(rapport)
        continue
      }

      // 4b. Pas de coordonnées → on ne peut ni placer sur la carte ni filtrer
      if (!geo || geo.lat == null || geo.lng == null) {
        rapport.verdict = 'sans_lieu'
        rapport.commentaire = 'lieu introuvable au géocodage'
        base.totaux.regles_sans_lieu++
        base.regles.push(rapport)
        continue
      }

      // 4c. Filtre géographique, au rayon propre à cette source
      const zone = await checkZone(geo.lat, geo.lng, source.rayon_km)
      rapport.distance_km = zone.distanceMin
      if (!zone.within) {
        rapport.verdict = 'hors_zone'
        rapport.commentaire = `${zone.distanceMin} km de ${zone.centreLePlusProche} (limite ${zone.rayon} km)`
        base.totaux.regles_hors_zone++
        base.regles.push(rapport)
        continue
      }

      // 4d. Les dates
      const dates = occurrences(r, horizon)
      rapport.occurrences = dates
      base.totaux.regles_retenues++
      base.totaux.occurrences_prevues += dates.length

      if (dates.length === 0) {
        rapport.commentaire = r.periode_texte
          ? `hors saison (${r.periode_texte})`
          : 'aucune date dans l\'horizon'
        base.regles.push(rapport)
        continue
      }

      // 4e. Le lieu — résolu UNE fois par règle, pas une fois par occurrence
      const lieuNom = r.lieu_nom || r.commune || r.titre
      const { id: lieuId, reutilise } = await trouveOuCreeLieu(lieuNom, r.commune ?? null, geo, dryRun)
      if (reutilise) rapport.commentaire = 'lieu existant réutilisé'

      const descriptionFinale = [r.description?.trim(), r.periode_texte ? `Période : ${r.periode_texte}.` : null]
        .filter(Boolean).join(' ')

      for (const d of dates) {
        aInserer.push({
          titre:            r.titre,
          description:      descriptionFinale || null,
          date_debut:       d,
          date_fin:         null,
          heure:            r.heure,
          categorie:        'marche',
          categories:       ['marche'],
          statut:           statutCible,
          lieu_id:          lieuId,
          serie_cle:        serieCle,
          source:           'scrape',
          scrape_source_id: source.id,
          doublon_verifie:  true,   // le verrou d'unicité remplace la dédup IA
        })
      }

      base.regles.push(rapport)
    }

    // 5. Écriture — un seul upsert. Le verrou (serie_cle, date_debut) écarte
    //    silencieusement tout ce qui existe déjà : re-scraper est sans effet.
    if (!dryRun && aInserer.length > 0) {
      const { data: creees, error } = await supabaseAdmin
        .from('evenements')
        .upsert(aInserer, { onConflict: 'serie_cle,date_debut', ignoreDuplicates: true })
        .select('id, serie_cle')
      if (error) throw new Error(`Insertion : ${error.message}`)

      const parSerie: Record<string, number> = {}
      for (const e of creees ?? []) {
        parSerie[e.serie_cle as string] = (parSerie[e.serie_cle as string] ?? 0) + 1
      }
      for (const rap of base.regles) rap.inserees = parSerie[rap.serie_cle] ?? 0

      base.totaux.occurrences_creees = creees?.length ?? 0
      base.totaux.occurrences_ignorees = aInserer.length - base.totaux.occurrences_creees
    } else if (dryRun) {
      base.totaux.occurrences_creees = 0
      base.totaux.occurrences_ignorees = 0
    }

    base.inseres  = base.totaux.occurrences_creees
    base.doublons = base.totaux.occurrences_ignorees

    if (!dryRun) {
      await supabaseAdmin.from('sources')
        .update({ dernier_scrape: new Date().toISOString() })
        .eq('id', source.id)
    }
  } catch (e: unknown) {
    base.erreur = e instanceof Error ? e.message : 'Erreur inconnue'
  }

  // 6. Journal — l'aperçu ne laisse pas de trace, il n'a rien fait
  if (!dryRun) {
    await supabaseAdmin.from('scrape_logs').insert({
      source_id: source.id,
      trouves:   base.trouves,
      doublons:  base.doublons,
      inseres:   base.inseres,
      erreur:    base.erreur,
    })
  }

  return base
}
