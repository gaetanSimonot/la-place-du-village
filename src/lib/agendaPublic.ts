import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { NextRequest } from 'next/server'
import { GET as lireAgenda } from '@/app/api/agenda/route'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { dateParis } from '@/lib/cinema'
import { SITE, communeDe, slugCommune } from '@/lib/seo'
import { territoiresActifs, territoireParDefaut, territoireParSlug, type Territoire } from '@/lib/territoires'
import { haversineKm } from '@/lib/distance'
import type { Categorie, Evenement } from '@/lib/types'

/**
 * LES PAGES D'ENTRÉE DEPUIS GOOGLE — « Que faire ce week-end dans les
 * Cévennes », « Que faire au Vigan ».
 *
 * Aucun écran de l'app n'y mène : elles existent pour qu'une recherche
 * générale tombe sur La Place, puis renvoient vers la carte et les fiches.
 * SERVEUR UNIQUEMENT.
 */

/** « dans les Cévennes », « autour de Pau ». */
export function dansLeTerritoire(t: { slug: string; nom: string }): string {
  return t.slug === 'cevennes' ? 'dans les Cévennes' : `autour de ${t.nom}`
}

/** « à Ganges », « au Vigan », « aux Plantiers », « à La Salle ». */
export function aLaCommune(nom: string): string {
  if (/^Le\s/i.test(nom)) return `au ${nom.slice(3)}`
  if (/^Les\s/i.test(nom)) return `aux ${nom.slice(4)}`
  return `à ${nom}`
}

/**
 * Le week-end, avec EXACTEMENT la sélection du filtre « Ce week-end » de
 * l'agenda : on appelle la même route, pas une copie de sa requête. Les
 * événements déjà passés (vendredi, vu du dimanche) sont écartés.
 */
export async function evenementsDuWeekEnd(territoireSlug: string): Promise<Evenement[]> {
  const res = await lireAgenda(new NextRequest(
    `${SITE}/api/agenda?quand=ce_week_end&territoire=${encodeURIComponent(territoireSlug)}`))
  const j = await res.json() as { evenements?: Evenement[] }
  const t = await territoireParSlug(territoireSlug)
  const dedans = await perimetre()
  return (j.evenements ?? []).filter(e => dedans(t?.id ?? null, e))
}

/**
 * LE PÉRIMÈTRE D'AFFICHAGE, le même que la carte : le rayon d'affichage du
 * territoire autour de ses centres (« Outils zone géo », ou le curseur admin
 * des réglages de la carte). Les pages d'entrée ne montrent pas plus que la
 * carte : ce qui est en base au-delà (insertion jusqu'à 95 km) n'y paraît pas.
 * Sans rayon ou sans centre connu, ou sans coordonnées, on ne filtre pas —
 * comme la carte. Relu à chaque requête (territoires : cache 60 s).
 */
async function perimetre(): Promise<(territoireId: string | null | undefined, e: Evenement) => boolean> {
  const [actifs, defaut, { data: centres }] = await Promise.all([
    territoiresActifs(), territoireParDefaut(),
    supabaseAdmin.from('zone_centres').select('lat, lng, territoire_id'),
  ])
  return (territoireId, e) => {
    const t = territoireId ? actifs.find(x => x.id === territoireId) : defaut
    if (!t || !(t.rayon_affichage_km > 0)) return true
    const cs = (centres ?? []).filter(c => c.territoire_id === t.id)
    const l = e.lieux as { lat?: number | null; lng?: number | null } | null
    if (!cs.length || l?.lat == null || l?.lng == null) return true
    const lat = l.lat, lng = l.lng
    return cs.some(c => haversineKm(lat, lng, c.lat as number, c.lng as number) <= t.rayon_affichage_km)
  }
}

export interface Commune { nom: string; slug: string; evenements: Evenement[] }

type EvenementLocal = Evenement & { territoire_id?: string | null }

/**
 * Les événements publiés à venir (trois mois), DANS LE PÉRIMÈTRE
 * D'AFFICHAGE (le même que la carte), lus une fois par requête :
 * toutes les pages d'entrée, et la suite de leurs listes (api/pages-entree),
 * partent de cette même lecture. PAS de cache au-delà de la requête : la page
 * doit être à jour à chaque ouverture (choix de Gaëtan, 27/11).
 */
const evenementsAVenir = cache(async (): Promise<EvenementLocal[]> => {
  const auj = dateParis()
  const fin = dateParis(92)
  const { data } = await supabaseAdmin
    .from('evenements')
    .select('id, titre, categorie, categories, date_debut, date_fin, heure, jours_semaine, dates, image_url, image_position, promotion, promo_ordre, radio_selection, territoire_id, lieux(id, nom, commune, adresse, lat, lng, place_id_google)')
    .eq('statut', 'publie')
    .lte('date_debut', fin)
    .or(`date_fin.gte.${auj},and(date_fin.is.null,date_debut.gte.${auj})`)
    .order('date_debut')
    .order('heure', { nullsFirst: false })
    .limit(2000)
  const dedans = await perimetre()
  return ordreDeLAgenda(((data ?? []) as unknown as EvenementLocal[]).filter(e => dedans(e.territoire_id, e)))
})

/**
 * LE MÊME ORDRE QUE L'AGENDA DE L'APP en « tout » (api/agenda/route.ts) :
 * ce qui a lieu à une date — ce soir, samedi — d'abord, par date puis heure
 * (sans heure en dernier) ; ce qui est INSTALLÉ (plus d'une semaine : une
 * expo, une permanence, « jusqu'au 31 décembre ») ferme la marche, le plus
 * court d'abord. Recopié de la route : si elle change, changer ici aussi.
 */
const JOURS_INSTALLE = 7
function dureeEnJours(e: { date_debut?: string | null; date_fin?: string | null }): number {
  if (!e.date_debut || !e.date_fin || e.date_fin === e.date_debut) return 0
  const d1 = Date.parse(`${e.date_debut}T12:00:00Z`), d2 = Date.parse(`${e.date_fin}T12:00:00Z`)
  return Number.isNaN(d1) || Number.isNaN(d2) ? 0 : Math.round((d2 - d1) / 86_400_000)
}
function ordreDeLAgenda<T extends Evenement>(evts: T[]): T[] {
  return [...evts].sort((a, b) => {
    const ja = dureeEnJours(a), jb = dureeEnJours(b)
    const ia = ja >= JOURS_INSTALLE, ib = jb >= JOURS_INSTALLE
    if (ia !== ib) return ia ? 1 : -1
    if (ia && ja !== jb) return ja - jb
    const da = String(a.date_debut ?? ''), db = String(b.date_debut ?? '')
    if (da !== db) return da.localeCompare(db)
    const ha = String(a.heure ?? ''), hb = String(b.heure ?? '')
    if (!ha !== !hb) return ha ? -1 : 1
    return ha.localeCompare(hb)
  })
}

/**
 * Les communes qui ont des événements à venir (trois mois), avec ces
 * événements. La commune est lue sur le lieu, ou à défaut dans son adresse.
 */
export async function communesAVenir(): Promise<Commune[]> {
  const parSlug = new Map<string, Commune>()
  for (const e of await evenementsAVenir()) {
    const nom = communeDe(e.lieux as { commune?: string | null; adresse?: string | null } | null)
    if (!nom) continue
    const slug = slugCommune(nom)
    if (!slug) continue
    const c = parSlug.get(slug) ?? { nom, slug, evenements: [] }
    c.evenements.push(e)
    parSlug.set(slug, c)
  }
  return Array.from(parSlug.values()).sort((a, b) => b.evenements.length - a.evenements.length)
}

/**
 * Une commune n'entre au sitemap qu'à partir de deux événements à venir : une
 * page d'un seul lien n'apprend rien. En dessous, sa page existe toujours
 * (« rien de prévu pour l'instant ») : une commune qui oscille autour du seuil
 * ne doit pas laisser à Google une adresse du sitemap tombée en 404.
 */
export const SEUIL_COMMUNE = 2

/**
 * Une commune connue de La Place (au moins un lieu chez elle) qui n'a rien
 * à venir : son nom, et son territoire d'après ses événements passés (null
 * s'il n'en a jamais eu). null pour une adresse qui ne correspond à rien : 404.
 */
export async function communeConnue(slug: string): Promise<{ nom: string; territoire: string | null } | null> {
  let nom: string | null = null
  const ids: string[] = []
  // Par pages de 1000 : Supabase ne rend pas plus d'un coup.
  for (let debut = 0; ; debut += 1000) {
    const { data } = await supabaseAdmin
      .from('lieux')
      .select('id, commune, adresse')
      .order('id')
      .range(debut, debut + 999)
    for (const l of data ?? []) {
      const n = communeDe(l)
      if (n && slugCommune(n) === slug) { nom ??= n; ids.push(l.id as string) }
    }
    if (!data || data.length < 1000) break
  }
  if (!nom) return null
  const { data: evts } = await supabaseAdmin
    .from('evenements').select('territoire_id').in('lieu_id', ids.slice(0, 200)).limit(500)
  const terr = await slugTerritoireDe()
  const votes = new Map<string, number>()
  for (const e of evts ?? []) { const t = terr(e.territoire_id as string | null); if (t) votes.set(t, (votes.get(t) ?? 0) + 1) }
  return { nom, territoire: Array.from(votes.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null }
}

/**
 * OUVERT AU PUBLIC : pour l'instant le seul territoire par défaut (les
 * Cévennes). Les autres (Pau) ne se voient dans l'app qu'en admin : ils n'ont
 * ni pages d'entrée, ni place au sitemap, ni lien depuis les fiches. Le jour
 * où Pau ouvre, c'est cette règle qui change.
 */
export const territoirePublic = (t: { par_defaut: boolean } | null | undefined) => !!t?.par_defaut
export async function territoiresPublics(): Promise<Territoire[]> {
  return (await territoiresActifs()).filter(territoirePublic)
}
/** Une commune a des pages si son territoire est public (inconnu = public, comme l'app). */
export async function communePublique(territoire: string | null): Promise<boolean> {
  return territoire == null || (await territoiresPublics()).some(t => t.slug === territoire)
}

/* ── La hiérarchie des pages d'entrée ──────────────────────────────────────
 *
 *   /agenda/<territoire>             Que faire dans les Cévennes ?   (tous types)
 *   /agenda/<territoire>/<type>      Concerts dans les Cévennes
 *   /que-faire/<commune>             Que faire à Ganges ?            (tous types)
 *   /que-faire/<commune>/<type>      Concerts à Ganges
 *
 * Aucune page n'est fabriquée ni stockée : un gabarit par niveau répond à
 * toute adresse et affiche ce que la base contient à l'instant. Le SEUIL ne
 * crée rien, il décide si la page est ANNONCÉE (sitemap, liens depuis les
 * fiches et les autres pages). Sous le seuil, la page reste en ligne
 * (« rien de prévu ») : jamais de 404 pour une adresse déjà donnée à Google.
 */

/** Les types qui ont leurs pages. « Autre » n'en a pas : ce n'est pas un type. */
export interface TypeSortie { slug: string; cat: Categorie; nom: string }
export const TYPES_SORTIE: TypeSortie[] = [
  { slug: 'concerts', cat: 'concert', nom: 'Concerts' },
  { slug: 'theatre', cat: 'theatre', nom: 'Théâtre' },
  { slug: 'ateliers', cat: 'atelier', nom: 'Ateliers' },
  { slug: 'expositions', cat: 'exposition', nom: 'Expositions' },
  { slug: 'marches', cat: 'marche', nom: 'Marchés' },
  { slug: 'fetes', cat: 'fete', nom: 'Fêtes' },
  { slug: 'bien-etre', cat: 'sante_bien_etre', nom: 'Bien-être' },
  { slug: 'sport', cat: 'sport', nom: 'Sport' },
]
export const typeParSlug = (slug: string) => TYPES_SORTIE.find(t => t.slug === slug) ?? null
export const typeDeCategorie = (cat: string | null | undefined) => TYPES_SORTIE.find(t => t.cat === cat) ?? null

/** Un type (commune ou territoire) n'est annoncé qu'à partir de trois rendez-vous. */
export const SEUIL_TYPE = 3

/** Un événement compte dans chacune de ses catégories. */
export const categoriesDe = (e: Evenement): Categorie[] =>
  (e.categories?.length ? e.categories : [e.categorie]) as Categorie[]

/** « Que faire dans les Cévennes ? » / « Que faire autour de Pau ? » */
export const titreTerritoire = (t: { slug: string; nom: string }) => `Que faire ${dansLeTerritoire(t)} ?`

type Compte = Partial<Record<Categorie, number>>
export interface CommuneCarte {
  nom: string; slug: string; n: number; types: Compte
  territoire: string | null   // slug du territoire où elle a le plus d'événements
  lat: number | null; lng: number | null
}
export interface CarteLocale {
  communes: CommuneCarte[]
  territoires: Record<string, { n: number; types: Compte }>
}

/** Le territoire (slug) d'un événement : le sien s'il est ouvert. */
async function slugTerritoireDe(): Promise<(id: string | null | undefined) => string | null> {
  const actifs = await territoiresActifs()
  const parId = new Map(actifs.map(t => [t.id, t.slug]))
  const defaut = (await territoireParDefaut())?.slug ?? null
  return id => (id ? parId.get(id) ?? null : defaut)
}

/**
 * Qui a combien de quoi, où. Petite (quelques Ko), gardée 1 min hors des
 * requêtes : la fiche événement, rendue à chaque visite, la lit pour savoir
 * vers quelles pages pointer sans relire tous les événements à chaque fois.
 */
export const carteLocale = unstable_cache(async (): Promise<CarteLocale> => {
  const terr = await slugTerritoireDe()
  type Accu = CommuneCarte & { votes: Map<string, number>; sLat: number; sLng: number; nPos: number }
  const communes = new Map<string, Accu>()
  const territoires: CarteLocale['territoires'] = {}
  for (const e of await evenementsAVenir()) {
    const cats = categoriesDe(e)
    const t = terr(e.territoire_id)
    if (t) {
      const ct = territoires[t] ??= { n: 0, types: {} }
      ct.n++
      for (const k of cats) ct.types[k] = (ct.types[k] ?? 0) + 1
    }
    const nom = communeDe(e.lieux as { commune?: string | null; adresse?: string | null } | null)
    const slug = nom ? slugCommune(nom) : ''
    if (!nom || !slug) continue
    const c: Accu = communes.get(slug) ?? { nom, slug, n: 0, types: {}, territoire: null, lat: null, lng: null, votes: new Map(), sLat: 0, sLng: 0, nPos: 0 }
    c.n++
    for (const k of cats) c.types[k] = (c.types[k] ?? 0) + 1
    if (t) c.votes.set(t, (c.votes.get(t) ?? 0) + 1)
    const l = e.lieux as { lat?: number | null; lng?: number | null } | null
    if (l?.lat != null && l?.lng != null) { c.sLat += l.lat; c.sLng += l.lng; c.nPos++ }
    communes.set(slug, c)
  }
  return {
    territoires,
    communes: Array.from(communes.values()).map(({ votes, sLat, sLng, nPos, ...c }) => ({
      ...c,
      territoire: Array.from(votes.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      lat: nPos ? sLat / nPos : null,
      lng: nPos ? sLng / nPos : null,
    })),
  }
}, ['carte-locale-v1'], { revalidate: 60 })

export const communeAnnoncee = (c: CommuneCarte) => c.n >= SEUIL_COMMUNE
/**
 * « Concerts à X » annoncée à partir de 3 concerts — sauf si X n'a QUE des
 * concerts : la page répéterait « Que faire à X » mot pour mot.
 */
export const typeCommuneAnnonce = (c: CommuneCarte, cat: Categorie) => {
  const n = c.types[cat] ?? 0
  return n >= SEUIL_TYPE && n < c.n
}
export const typeTerritoireAnnonce = (carte: CarteLocale, territoire: string, cat: Categorie) =>
  (carte.territoires[territoire]?.types[cat] ?? 0) >= SEUIL_TYPE

/** Les communes les plus proches de `c`, dans son territoire, qui passent `garder`. */
function voisines(carte: CarteLocale, c: CommuneCarte, garder: (v: CommuneCarte) => boolean, combien = 6): CommuneCarte[] {
  const { lat, lng } = c
  if (lat == null || lng == null) return []
  return carte.communes
    .filter(v => v.slug !== c.slug && v.territoire === c.territoire && v.lat != null && v.lng != null && garder(v))
    .map(v => ({ v, d: haversineKm(lat, lng, v.lat as number, v.lng as number) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, combien)
    .map(x => x.v)
}

/** Les événements à venir d'un territoire, éventuellement d'un seul type. */
export async function evenementsDuTerritoire(territoireSlug: string, cat?: Categorie): Promise<Evenement[]> {
  const terr = await slugTerritoireDe()
  return (await evenementsAVenir()).filter(e =>
    terr(e.territoire_id) === territoireSlug && (!cat || categoriesDe(e).includes(cat)))
}

/* ── Les liens entre pages ─────────────────────────────────────────────── */

export interface Lien { href: string; label: string; n?: number }
export interface GroupeLiens { titre: string; liens: Lien[] }

const groupes = (gs: GroupeLiens[]) => gs.filter(g => g.liens.length > 0)
/** Le territoire d'une page ou d'un lien — PUBLIC seulement : on ne pointe jamais vers Pau. */
const territoireDeSlug = async (slug: string | null): Promise<Territoire | null> =>
  slug ? (await territoiresPublics()).find(t => t.slug === slug) ?? null : null

/** « de Ganges », « du Vigan », « des Plantiers ». */
export function deLaCommune(nom: string): string {
  if (/^Le\s/i.test(nom)) return `du ${nom.slice(3)}`
  if (/^Les\s/i.test(nom)) return `des ${nom.slice(4)}`
  return `de ${nom}`
}

/**
 * La navigation d'une page d'entrée, dans l'allure de l'agenda de l'app :
 *  - `ariane` : le chemin au-dessus (Cévennes › Ganges) ;
 *  - `onglets` : les pastilles de type EN HAUT — « Tout », puis chaque type
 *    annoncé, chacune étant sa propre page (« Ateliers à Ganges ») ;
 *  - `liens` : un seul petit bloc en bas (les communes autour, ou toutes les
 *    communes sur une page territoire).
 */
export interface Onglet { href: string; label: string; n?: number; cat?: Categorie; actif?: boolean }
export interface NavPage { ariane: Lien[]; onglets: Onglet[]; liens: GroupeLiens[] }

/**
 * La suite de la ligne « 33 événements · … », comme l'agenda de l'app :
 * les trois types les plus fournis, ou ce qu'on dit d'une page vide.
 */
export function suiteDuResume(n: number, onglets: Onglet[], sinon = 'à venir'): string {
  if (n === 0) return 'rien de prévu pour l’instant'
  const types = onglets.filter(o => o.cat && !o.actif).sort((a, b) => (b.n ?? 0) - (a.n ?? 0)).slice(0, 3)
  return types.length ? types.map(o => o.label.toLowerCase()).join(' · ') : sinon
}

/** « Que faire à X ? » (type null) ou « Concerts à X ». */
export async function navCommune(slug: string, type: TypeSortie | null): Promise<NavPage> {
  const carte = await carteLocale()
  const c = carte.communes.find(x => x.slug === slug)
  if (!c) return { ariane: [], onglets: [], liens: [] }
  const t = await territoireDeSlug(c.territoire)
  return {
    ariane: [
      ...(t ? [{ href: `/agenda/${t.slug}`, label: t.nom }] : []),
      ...(type ? [{ href: `/que-faire/${c.slug}`, label: c.nom }] : []),
    ],
    onglets: [
      { href: `/que-faire/${c.slug}`, label: 'Tout', n: c.n, actif: !type },
      ...TYPES_SORTIE.filter(ty => ty.slug === type?.slug || typeCommuneAnnonce(c, ty.cat))
        .map(ty => ({ href: `/que-faire/${c.slug}/${ty.slug}`, label: ty.nom, n: c.types[ty.cat], cat: ty.cat, actif: ty.slug === type?.slug })),
    ],
    liens: groupes([type
      ? { titre: `${type.nom} autour ${deLaCommune(c.nom)}`, liens: voisines(carte, c, v => typeCommuneAnnonce(v, type.cat))
          .map(v => ({ href: `/que-faire/${v.slug}/${type.slug}`, label: v.nom, n: v.types[type.cat] })) }
      : { titre: `Autour ${deLaCommune(c.nom)}`, liens: voisines(carte, c, communeAnnoncee)
          .map(v => ({ href: `/que-faire/${v.slug}`, label: v.nom, n: v.n })) },
    ]),
  }
}

/** « Que faire dans les Cévennes ? » (type null) ou « Concerts dans les Cévennes ». */
export async function navTerritoire(t: Territoire, type: TypeSortie | null): Promise<NavPage> {
  const carte = await carteLocale()
  const ct = carte.territoires[t.slug]
  const communes = carte.communes.filter(c => c.territoire === t.slug && (type ? typeCommuneAnnonce(c, type.cat) : communeAnnoncee(c)))
    .sort((a, b) => (type ? (b.types[type.cat] ?? 0) - (a.types[type.cat] ?? 0) : b.n - a.n))
  return {
    ariane: type ? [{ href: `/agenda/${t.slug}`, label: t.nom }] : [],
    onglets: [
      { href: `/agenda/${t.slug}`, label: 'Tout', n: ct?.n, actif: !type },
      ...TYPES_SORTIE.filter(ty => ty.slug === type?.slug || typeTerritoireAnnonce(carte, t.slug, ty.cat))
        .map(ty => ({ href: `/agenda/${t.slug}/${ty.slug}`, label: ty.nom, n: ct?.types[ty.cat], cat: ty.cat, actif: ty.slug === type?.slug })),
    ],
    liens: groupes([
      { titre: type ? `${type.nom} par commune` : 'Par commune', liens: communes
        .map(c => type
          ? { href: `/que-faire/${c.slug}/${type.slug}`, label: c.nom, n: c.types[type.cat] }
          : { href: `/que-faire/${c.slug}`, label: c.nom, n: c.n }) },
    ]),
  }
}

/**
 * La ligne de liens d'une fiche événement : « Concerts à Ganges · Que faire
 * à Ganges · Que faire dans les Cévennes », seulement vers des pages annoncées.
 */
export async function liensDeLaFiche(commune: string | null, categorie: string | null, territoireId: string | null): Promise<Lien[]> {
  const carte = await carteLocale()
  const t = await territoireDeSlug((await slugTerritoireDe())(territoireId))
  const trouvee = commune ? carte.communes.find(x => x.slug === slugCommune(commune)) : undefined
  const c = trouvee && await communePublique(trouvee.territoire) ? trouvee : undefined
  const type = typeDeCategorie(categorie)
  const out: Lien[] = []
  if (c && type && typeCommuneAnnonce(c, type.cat)) out.push({ href: `/que-faire/${c.slug}/${type.slug}`, label: `${type.nom} ${aLaCommune(c.nom)}` })
  if (c && communeAnnoncee(c)) out.push({ href: `/que-faire/${c.slug}`, label: `Que faire ${aLaCommune(c.nom)}` })
  if (t) out.push({ href: `/agenda/${t.slug}`, label: `Que faire ${dansLeTerritoire(t)}` })
  return out
}

/** Pour le sitemap : les pages d'entrée NOUVELLES annoncées (territoires et types). */
export async function pagesLocalesAnnoncees(): Promise<string[]> {
  const carte = await carteLocale()
  const out: string[] = []
  const publics = await territoiresPublics()
  for (const t of publics) {
    out.push(`/agenda/${t.slug}`)
    for (const ty of TYPES_SORTIE) if (typeTerritoireAnnonce(carte, t.slug, ty.cat)) out.push(`/agenda/${t.slug}/${ty.slug}`)
  }
  for (const c of carte.communes) {
    if (c.territoire != null && !publics.some(t => t.slug === c.territoire)) continue
    for (const ty of TYPES_SORTIE) if (typeCommuneAnnonce(c, ty.cat)) out.push(`/que-faire/${c.slug}/${ty.slug}`)
  }
  return out
}

/**
 * La commune d'une page « Que faire à X » (et « Concerts à X ») : ses
 * événements à venir, ou aucun (« rien de prévu ») si elle est connue mais
 * calme. null — donc 404 — si l'adresse ne correspond à rien, ou si la
 * commune est dans un territoire pas encore ouvert au public (Pau).
 */
export async function communeDePage(slug: string): Promise<Commune | null> {
  const c = (await communesAVenir()).find(x => x.slug === slug)
  if (c) return (await communePublique(await territoireDeLaCommune(slug))) ? c : null
  const k = await communeConnue(slug)
  return k && (await communePublique(k.territoire)) ? { nom: k.nom, slug, evenements: [] } : null
}

/** Le territoire (slug) d'une commune qui a des événements à venir, sinon null. */
export async function territoireDeLaCommune(slug: string): Promise<string | null> {
  return (await carteLocale()).communes.find(c => c.slug === slug)?.territoire ?? null
}

/* ── Une page à la fois, comme l'agenda de l'app ───────────────────────── */

/** Cartouches envoyées d'un coup ; la suite vient en descendant. */
export const PAR_PAGE = 30

/** Ce qui désigne la liste d'une page d'entrée — pour en demander la suite. */
export type SourcePage =
  | { niveau: 'commune'; slug: string; type?: string }
  | { niveau: 'territoire'; slug: string; type?: string }
  | { niveau: 'week-end'; slug: string }
  | { niveau: 'noel'; slug: string; type?: string; commune?: string }

/**
 * La liste COMPLÈTE d'une page d'entrée, dans l'ordre de l'agenda. null : la
 * page n'existe pas (adresse inconnue, Pau). La page en montre les PAR_PAGE
 * premières, api/pages-entree rend la suite : une seule définition des deux.
 */
export async function listeDeLaPage(src: SourcePage): Promise<Evenement[] | null> {
  if (src.niveau === 'commune') {
    const c = await communeDePage(src.slug)
    if (!c) return null
    if (!src.type) return c.evenements
    const ty = typeParSlug(src.type)
    return ty ? c.evenements.filter(e => categoriesDe(e).includes(ty.cat)) : null
  }
  const t = await territoireParSlug(src.slug)
  if (!t || !t.actif || !territoirePublic(t)) return null
  if (src.niveau === 'week-end') return evenementsDuWeekEnd(t.slug)
  if (src.niveau === 'noel') {
    const ty = src.type ? typeParSlug(src.type) : null
    if (src.type && !ty) return null
    return evenementsDeNoel(t.slug, ty?.cat, src.commune)
  }
  if (!src.type) return evenementsDuTerritoire(t.slug)
  const ty = typeParSlug(src.type)
  return ty ? evenementsDuTerritoire(t.slug, ty.cat) : null
}

/* ── Que faire à Noël ──────────────────────────────────────────────────── */

/*
 * CE QUI EST « DE NOËL » : repéré au titre (Noël, l'Avent, santons, crèche,
 * réveillon, pastorale, calendale, Nadal, lutins, illuminations) ou à la
 * description (les mêmes, sauf crèche et illuminations, trop larges hors du
 * titre). Pas de catégorie « Noël » : c'est un thème, il traverse les types.
 */
const NOEL_TITRE = "(no[eë]l|l['’]avent|santon|r[ée]veillon|calendal|pastorale|nadal|lutin|cr[èe]che|illumination)"
const NOEL_DESCRIPTION = "(no[eë]l|l['’]avent|santon|r[ée]veillon|calendal|pastorale|nadal)"
const idsDeNoel = cache(async (): Promise<Set<string>> => {
  const { data } = await supabaseAdmin
    .from('evenements')
    .select('id')
    .eq('statut', 'publie')
    .or(`titre.imatch."${NOEL_TITRE}",description.imatch."${NOEL_DESCRIPTION}"`)
    .lte('date_debut', dateParis(92))
    .limit(3000)
  return new Set((data ?? []).map(e => e.id as string))
})

/** Les rendez-vous de Noël d'un territoire (dans son périmètre), d'un type ou de tous. */
export async function evenementsDeNoel(territoireSlug: string, cat?: Categorie, communeSlug?: string | null): Promise<Evenement[]> {
  const [ids, tous] = await Promise.all([idsDeNoel(), evenementsDuTerritoire(territoireSlug, cat)])
  return tous.filter(e => ids.has(e.id) && (!communeSlug || slugDeLaCommune(e) === communeSlug))
}
const slugDeLaCommune = (e: Evenement): string | null => {
  const nom = communeDe(e.lieux as { commune?: string | null; adresse?: string | null } | null)
  return nom ? slugCommune(nom) : null
}
/** Les communes d'une liste, les plus fournies d'abord. */
function communesDe(evts: Evenement[]): { slug: string; nom: string; n: number }[] {
  const m = new Map<string, { slug: string; nom: string; n: number }>()
  for (const e of evts) {
    const nom = communeDe(e.lieux as { commune?: string | null; adresse?: string | null } | null)
    if (!nom) continue
    const k = slugCommune(nom)
    const c = m.get(k) ?? { slug: k, nom, n: 0 }
    c.n++; m.set(k, c)
  }
  return Array.from(m.values()).sort((a, b) => b.n - a.n || a.nom.localeCompare(b.nom, 'fr'))
}

/**
 * La navigation de la page de Noël : pastilles de type (comptées dans la
 * commune choisie), choix de la commune (comptées dans le type choisi, les
 * plus fournies d'abord) et, en bas, les communes en liens. Chaque lien garde
 * l'autre filtre : « Marchés » puis « Ganges » = les marchés de Noël de Ganges.
 */
export async function navNoel(t: Territoire, type: TypeSortie | null, communeSlug: string | null): Promise<NavPage & {
  communes: { slug: string; nom: string; n: number; href: string }[]
  communeNom: string | null
  toutesCommunes: { href: string; n: number }
}> {
  const base = `/agenda/${t.slug}/noel`
  const lien = (ty: string | null, co: string | null) => {
    const q = new URLSearchParams()
    if (ty) q.set('type', ty)
    if (co) q.set('commune', co)
    const qs = q.toString()
    return qs ? `${base}?${qs}` : base
  }
  const [dansLaCommune, dansLeType] = await Promise.all([
    evenementsDeNoel(t.slug, undefined, communeSlug),
    evenementsDeNoel(t.slug, type?.cat),
  ])
  const parType = new Map<Categorie, number>()
  for (const e of dansLaCommune) for (const c of categoriesDe(e)) parType.set(c, (parType.get(c) ?? 0) + 1)
  const communes = communesDe(dansLeType).map(c => ({ ...c, href: lien(type?.slug ?? null, c.slug) }))
  // La commune choisie n'a rien de ce type : elle reste dans la liste (à 0),
  // sinon le bouton afficherait « Toutes les communes » alors qu'on filtre.
  if (communeSlug && !communes.some(c => c.slug === communeSlug)) {
    const nom = communesDe(dansLaCommune)[0]?.nom
    if (nom) communes.push({ slug: communeSlug, nom, n: 0, href: lien(type?.slug ?? null, communeSlug) })
  }
  const communeNom = communeSlug ? communes.find(c => c.slug === communeSlug)?.nom ?? null : null
  return {
    ariane: [{ href: `/agenda/${t.slug}`, label: t.nom }],
    onglets: [
      { href: lien(null, communeSlug), label: 'Tout', n: dansLaCommune.length, actif: !type },
      ...TYPES_SORTIE.filter(ty => ty.slug === type?.slug || (parType.get(ty.cat) ?? 0) > 0)
        .map(ty => ({ href: lien(ty.slug, communeSlug), label: ty.nom, n: parType.get(ty.cat) ?? 0, cat: ty.cat, actif: ty.slug === type?.slug })),
    ],
    communes,
    communeNom,
    toutesCommunes: { href: lien(type?.slug ?? null, null), n: dansLeType.length },
    liens: groupes([
      { titre: 'Noël par commune', liens: communes.filter(c => c.slug !== communeSlug && c.n >= SEUIL_COMMUNE)
        .map(c => ({ href: c.href, label: c.nom, n: c.n })) },
      { titre: 'Et aussi', liens: [{ href: `/agenda/${t.slug}`, label: titreTerritoire(t) }] },
    ]),
  }
}
