/**
 * LIRE UN ÉVÉNEMENT QUE LE SITE DÉCRIT LUI-MÊME (schema.org/Event).
 *
 * Beaucoup d'agendas déposent dans leurs pages un bloc `application/ld+json`
 * au format schema.org : titre, description entière, date AVEC l'heure,
 * adresse postale découpée, tarif, image. C'est le site qui parle de
 * lui-même, et non une lecture de sa mise en page.
 *
 * Ce fichier ne fait que LIRE et TRADUIRE vers nos champs. Il n'écrit rien,
 * n'appelle ni modèle ni géocodeur, et n'invente aucune valeur : ce que la
 * source ne dit pas ressort à null, pour que le manque se voie.
 *
 * Le pipeline qui s'en sert vit dans scraper-structure.ts.
 */
import type { Categorie } from './types'

// ── Lecture des données structurées ──────────────────────────────────────────

export interface AdressePostale {
  streetAddress?: string | null
  addressLocality?: string | null
  postalCode?: string | null
}
export interface LieuStructure {
  name?: string | null
  address?: AdressePostale | string | null
}
export interface OffreStructure { price?: number | string | null; priceCurrency?: string | null }

export interface EventStructure {
  '@type'?: string | string[]
  name?: string
  url?: string
  description?: string | null
  image?: string | string[] | null
  location?: LieuStructure | null
  startDate?: string | null
  endDate?: string | null
  offers?: OffreStructure | OffreStructure[] | null
  isAccessibleForFree?: boolean | null
}

export const UA = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
  'Accept-Language': 'fr-FR,fr;q=0.9',
}

export async function lirePage(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: UA, redirect: 'follow' })
    if (!r.ok) return null
    return await r.text()
  } catch {
    return null
  }
}

/**
 * Les blocs `Event` d'une page.
 *
 * On accepte les trois emballages que l'on rencontre : un objet seul, un
 * tableau, ou un `@graph`. Un bloc illisible est ignoré sans bruit — une
 * virgule en trop dans le JSON d'un site ne doit pas faire tomber un scrape.
 */
export function evenementsStructures(html: string): EventStructure[] {
  const out: EventStructure[] = []
  // `exec` en boucle plutôt que `matchAll` : le projet ne compile pas les
  // itérateurs (pas de `downlevelIteration`), et c'est la forme employée
  // partout ailleurs ici.
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    let parsed: unknown
    try { parsed = JSON.parse(m[1].trim()) } catch { continue }
    const graphe = parsed as { '@graph'?: unknown[] }
    const liste: unknown[] = Array.isArray(parsed)
      ? parsed
      : (Array.isArray(graphe?.['@graph']) ? graphe['@graph'] : [parsed])
    for (const x of liste) {
      const e = x as EventStructure
      const t = Array.isArray(e?.['@type']) ? e['@type'].join(' ') : String(e?.['@type'] ?? '')
      if (/Event/i.test(t) && e.name) out.push(e)
    }
  }
  return out
}

/** Cette page publie-t-elle des événements structurés ? */
export async function pagePubliesStructure(url: string): Promise<boolean> {
  const html = await lirePage(url)
  return !!html && evenementsStructures(html).length > 0
}

// ── Traduction vers nos champs ───────────────────────────────────────────────

/**
 * Le vocabulaire des agendas vers nos huit catégories.
 *
 * « Brocante » et « foire » rejoignent « marché », qui est le plus proche de
 * l'idée d'étals. « Visite » et « conférence » restent dans « autre » : elles
 * ne se confondent avec rien de ce que nous avons, et rien ne dit encore
 * qu'elles méritent chacune leur catégorie.
 *
 * « activites-loisirs » est le FOURRE-TOUT DE LA SOURCE : alentoor y range
 * aussi bien le Top 14 qu'un atelier fromage. Le traduire en « autre » serait
 * fidèle mais inutile — c'est le seul cas où l'on regarde le titre, et le
 * scraper le fait à part (voir scraper-structure.ts).
 */
const CATEGORIES_SOURCE: Record<string, Categorie> = {
  concert:                 'concert',
  spectacle:               'theatre',
  theatre:                 'theatre',
  sport:                   'sport',
  marche:                  'marche',
  'brocante-vide-grenier': 'marche',
  'foire-salon':           'marche',
  'activites-enfants':     'atelier',
  atelier:                 'atelier',
  festival:                'fete',
  festivites:              'fete',
  fete:                    'fete',
  exposition:              'exposition',
  conference:              'autre',
  visite:                  'autre',
  'activites-loisirs':     'autre',
}

/** Les rubriques trop larges pour dire quoi que ce soit du contenu. */
export const RUBRIQUES_FOURRE_TOUT = ['activites-loisirs']

/**
 * La catégorie annoncée par la fiche elle-même.
 *
 * Les agendas rangent leurs fiches sous une rubrique et y renvoient depuis la
 * fiche : ce lien est la catégorie, dite par la source. Aucun modèle n'a donc
 * à deviner, et si la rubrique nous est inconnue on ne force rien.
 */
export function categorieDepuisFiche(
  html: string,
  cheminListe: string,
): { categorie: Categorie; rubrique: string | null } {
  const base = cheminListe.replace(/^https?:\/\/[^/]+/, '').replace(/\/+$/, '')
  const re = new RegExp('href="' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/([a-z0-9-]+)"', 'gi')
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const connue = CATEGORIES_SOURCE[m[1]]
    if (connue) return { categorie: connue, rubrique: m[1] }
  }
  return { categorie: 'autre', rubrique: null }
}

/** « 2026-09-20T09:30:00+02:00 » → { date: '2026-09-20', heure: '09:30' }. */
export function dateEtHeure(iso: string | null | undefined): { date: string | null; heure: string | null } {
  if (!iso) return { date: null, heure: null }
  const m = String(iso).match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?/)
  if (!m) return { date: null, heure: null }
  // Minuit n'est pas une heure de début, c'est une date sans heure : les
  // agendas écrivent T00:00 quand ils ne savent pas. L'afficher ferait croire
  // à une séance de minuit.
  const heure = m[2] && !(m[2] === '00' && m[3] === '00') ? `${m[2]}:${m[3]}` : null
  return { date: m[1], heure }
}

/**
 * Le tarif, tel que la source le donne.
 *
 * `isAccessibleForFree` est une information VRAIE et utile — « Gratuit » sur
 * une fiche vaut mieux qu'un blanc. Un prix nul sans ce drapeau, en revanche,
 * veut dire « non renseigné » et non « gratuit » : on se tait.
 */
export function tarif(e: EventStructure): string | null {
  if (e.isAccessibleForFree === true) return 'Gratuit'
  const offres = Array.isArray(e.offers) ? e.offers : (e.offers ? [e.offers] : [])
  for (const o of offres) {
    const p = o?.price
    if (p == null || p === '' ) continue
    const n = Number(p)
    if (!Number.isFinite(n) || n <= 0) continue
    return n.toFixed(2).replace(/\.00$/, '') + ' €'
  }
  return null
}

/** La première image utilisable, ou rien. */
export function imageDe(e: EventStructure): string | null {
  const brut = Array.isArray(e.image) ? e.image[0] : e.image
  if (!brut || typeof brut !== 'string') return null
  /*
   * Les illustrations génériques de la source sont écartées. Ce sont des
   * vignettes de rubrique — la même image de brocante pour toutes les
   * brocantes de France. Notre app a déjà ses propres images de repli par
   * catégorie ; en récupérer une fausse ferait passer un dessin de banque
   * d'images pour la photo de l'événement.
   */
  if (/\/assets\/img\/|\/default\/|placeholder|no-?image/i.test(brut)) return null
  return brut.startsWith('http') ? brut : null
}

export function adresseDe(l: LieuStructure | null | undefined): AdressePostale {
  if (!l) return {}
  if (typeof l.address === 'string') return { streetAddress: l.address }
  return l.address ?? {}
}
