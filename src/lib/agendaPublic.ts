import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { NextRequest } from 'next/server'
import { GET as lireAgenda } from '@/app/api/agenda/route'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { dateParis } from '@/lib/cinema'
import { SITE, communeDe, slugCommune } from '@/lib/seo'
import { territoiresActifs, territoireParDefaut, type Territoire } from '@/lib/territoires'
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
  return j.evenements ?? []
}

export interface Commune { nom: string; slug: string; evenements: Evenement[] }

type EvenementLocal = Evenement & { territoire_id?: string | null }

/**
 * Les événements publiés à venir (trois mois), lus une fois par requête :
 * toutes les pages d'entrée partent de cette même lecture.
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
  return (data ?? []) as unknown as EvenementLocal[]
})

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
 * Le nom d'une commune connue de La Place (au moins un lieu chez elle), d'après
 * son adresse de page. null pour une adresse qui ne correspond à rien : 404.
 */
export async function communeConnue(slug: string): Promise<string | null> {
  // Par pages de 1000 : Supabase ne rend pas plus d'un coup.
  for (let debut = 0; ; debut += 1000) {
    const { data } = await supabaseAdmin
      .from('lieux')
      .select('commune, adresse')
      .order('id')
      .range(debut, debut + 999)
    for (const l of data ?? []) {
      const nom = communeDe(l)
      if (nom && slugCommune(nom) === slug) return nom
    }
    if (!data || data.length < 1000) return null
  }
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
 * Qui a combien de quoi, où. Petite (quelques Ko), gardée 15 min hors des
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
}, ['carte-locale-v1'], { revalidate: 900 })

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
const territoireDeSlug = async (slug: string | null): Promise<Territoire | null> =>
  slug ? (await territoiresActifs()).find(t => t.slug === slug) ?? null : null

/** Sous « Que faire à X ? » : ses types, les communes autour, le territoire. */
export async function liensCommune(slug: string): Promise<GroupeLiens[]> {
  const carte = await carteLocale()
  const c = carte.communes.find(x => x.slug === slug)
  if (!c) return []
  const t = await territoireDeSlug(c.territoire)
  return groupes([
    { titre: `Par type ${aLaCommune(c.nom)}`, liens: TYPES_SORTIE.filter(ty => typeCommuneAnnonce(c, ty.cat))
      .map(ty => ({ href: `/que-faire/${c.slug}/${ty.slug}`, label: ty.nom, n: c.types[ty.cat] })) },
    { titre: 'Autour', liens: voisines(carte, c, communeAnnoncee)
      .map(v => ({ href: `/que-faire/${v.slug}`, label: v.nom, n: v.n })) },
    { titre: 'Plus loin', liens: t ? [{ href: `/agenda/${t.slug}`, label: titreTerritoire(t) }] : [] },
  ])
}

/** Sous « Concerts à X » : X et ses autres types, les concerts autour, le territoire. */
export async function liensTypeCommune(slug: string, type: TypeSortie): Promise<GroupeLiens[]> {
  const carte = await carteLocale()
  const c = carte.communes.find(x => x.slug === slug)
  if (!c) return []
  const t = await territoireDeSlug(c.territoire)
  return groupes([
    { titre: `Aussi ${aLaCommune(c.nom)}`, liens: [
      ...(communeAnnoncee(c) ? [{ href: `/que-faire/${c.slug}`, label: `Que faire ${aLaCommune(c.nom)} ?`, n: c.n }] : []),
      ...TYPES_SORTIE.filter(ty => ty.slug !== type.slug && typeCommuneAnnonce(c, ty.cat))
        .map(ty => ({ href: `/que-faire/${c.slug}/${ty.slug}`, label: ty.nom, n: c.types[ty.cat] })),
    ] },
    { titre: `${type.nom} autour`, liens: voisines(carte, c, v => typeCommuneAnnonce(v, type.cat))
      .map(v => ({ href: `/que-faire/${v.slug}/${type.slug}`, label: v.nom, n: v.types[type.cat] })) },
    { titre: 'Plus loin', liens: t ? [
      ...(typeTerritoireAnnonce(carte, t.slug, type.cat) ? [{ href: `/agenda/${t.slug}/${type.slug}`, label: `${type.nom} ${dansLeTerritoire(t)}` }] : []),
      { href: `/agenda/${t.slug}`, label: titreTerritoire(t) },
    ] : [] },
  ])
}

/** Sous « Que faire dans les Cévennes ? » : toutes ses communes, tous ses types. */
export async function liensTerritoire(t: Territoire): Promise<GroupeLiens[]> {
  const carte = await carteLocale()
  return groupes([
    { titre: 'Par commune', liens: carte.communes.filter(c => c.territoire === t.slug && communeAnnoncee(c))
      .sort((a, b) => b.n - a.n)
      .map(c => ({ href: `/que-faire/${c.slug}`, label: c.nom, n: c.n })) },
    { titre: 'Par type', liens: TYPES_SORTIE.filter(ty => typeTerritoireAnnonce(carte, t.slug, ty.cat))
      .map(ty => ({ href: `/agenda/${t.slug}/${ty.slug}`, label: ty.nom, n: carte.territoires[t.slug]?.types[ty.cat] })) },
    { titre: 'Et aussi', liens: [{ href: `/ce-week-end/${t.slug}`, label: `Que faire ce week-end ${dansLeTerritoire(t)} ?` }] },
  ])
}

/** Sous « Concerts dans les Cévennes » : les communes qui en ont, les autres types. */
export async function liensTypeTerritoire(t: Territoire, type: TypeSortie): Promise<GroupeLiens[]> {
  const carte = await carteLocale()
  return groupes([
    { titre: `${type.nom} par commune`, liens: carte.communes.filter(c => c.territoire === t.slug && typeCommuneAnnonce(c, type.cat))
      .sort((a, b) => (b.types[type.cat] ?? 0) - (a.types[type.cat] ?? 0))
      .map(c => ({ href: `/que-faire/${c.slug}/${type.slug}`, label: c.nom, n: c.types[type.cat] })) },
    { titre: `Autres sorties ${dansLeTerritoire(t)}`, liens: TYPES_SORTIE.filter(ty => ty.slug !== type.slug && typeTerritoireAnnonce(carte, t.slug, ty.cat))
      .map(ty => ({ href: `/agenda/${t.slug}/${ty.slug}`, label: ty.nom, n: carte.territoires[t.slug]?.types[ty.cat] })) },
    { titre: 'Plus loin', liens: [{ href: `/agenda/${t.slug}`, label: titreTerritoire(t) }] },
  ])
}

/**
 * La ligne de liens d'une fiche événement : « Concerts à Ganges · Que faire
 * à Ganges · Que faire dans les Cévennes », seulement vers des pages annoncées.
 */
export async function liensDeLaFiche(commune: string | null, categorie: string | null, territoireId: string | null): Promise<Lien[]> {
  const carte = await carteLocale()
  const t = await territoireDeSlug((await slugTerritoireDe())(territoireId))
  const c = commune ? carte.communes.find(x => x.slug === slugCommune(commune)) : undefined
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
  for (const t of await territoiresActifs()) {
    out.push(`/agenda/${t.slug}`)
    for (const ty of TYPES_SORTIE) if (typeTerritoireAnnonce(carte, t.slug, ty.cat)) out.push(`/agenda/${t.slug}/${ty.slug}`)
  }
  for (const c of carte.communes) {
    for (const ty of TYPES_SORTIE) if (typeCommuneAnnonce(c, ty.cat)) out.push(`/que-faire/${c.slug}/${ty.slug}`)
  }
  return out
}
