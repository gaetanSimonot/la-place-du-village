import { unzipSync } from 'fflate'
import { territoireParSlug } from './territoires'
import { supabaseAdmin } from './supabase-admin'

/**
 * Import du GTFS liO — les horaires de bus du réseau régional.
 *
 * SOURCE : transport.data.gouv.fr, licence ODbL. On vise l'URL stable de
 * data.gouv.fr, qui redirige vers le serveur de l'exploitant : celle-là porte
 * une clé qui change, celle-ci ne bouge pas. Rien n'est scrapé, aucune clé
 * n'est à nous, aucune requête n'est facturée.
 *
 * PÉRIMÈTRE : on ne garde que les lignes de LIGNES_RETENUES. Le réseau entier
 * fait 309 lignes et 75 Mo de tracés ; les cars de l'Aude ne nous servent à
 * rien.
 *
 * POURQUOI TOUT EN MÉMOIRE : l'archive fait 24 Mo compressés, dont un
 * shapes.txt de 75 Mo. On la décompresse en entier, puis on parcourt les gros
 * fichiers LIGNE PAR LIGNE en ne retenant que les identifiants utiles — jamais
 * de tableau intermédiaire de 800 000 entrées.
 */

/**
 * LES RESEAUX QU'ON IMPORTE, UN PAR TERRITOIRE.
 *
 * C'etait une seule URL en dur. Ouvrir une ville suppose d'en brancher une
 * autre : le flux liO ne connait pas les cars du Bearn, et reciproquement.
 *
 * Pourquoi ici et pas en base : brancher un reseau n'est pas un reglage, c'est
 * une decision. Il faut lire le fichier de l'exploitant, reperer les lignes
 * qui servent vraiment le territoire, et verifier que leurs identifiants
 * n'entrent pas en collision avec ceux d'un autre reseau. Un champ de
 * formulaire donnerait l'illusion que ca se fait d'un clic.
 *
 * LES IDENTIFIANTS NE SE TELESCOPENT PAS, et c'est verifie : liO numerote ses
 * lignes « 101 » et ses arrets « 3013112 », le Bearn les qualifie
 * (« PYRENEES_ATLANTIQUES:Line:3448 », « MOBIITI:StopPlace:49408 »). Zero
 * collision sur les 763 arrets du second. Les deux reseaux vivent donc dans
 * les memes tables sans s'ecraser — c'est `territoire_id` sur la ligne qui
 * les separe a la lecture.
 */
export interface ReseauGtfs {
  /** Le territoire a qui appartiennent ces lignes. */
  territoire: string
  nom: string
  url: string
  /**
   * Les lignes retenues, par leur NUMERO tel qu'il s'affiche
   * (`route_short_name`), ou par `route_id` quand l'exploitant n'en publie
   * pas. Vide = tout le reseau, ce qui n'a de sens que sur un flux deja
   * restreint au territoire.
   */
  lignes: string[]
}

export const RESEAUX: ReseauGtfs[] = [
  {
    territoire: 'cevennes',
    nom: 'liO — cars de l\'Occitanie',
    url: 'https://www.data.gouv.fr/api/1/datasets/r/d747fe79-2915-4cdd-8cc5-51a810baaca5',
    // Le reseau entier compte 309 lignes : les cars de l'Aude ou du Tarn
    // n'ont rien a faire ici.
    lignes: [
      '101',  // Campestre-et-Luc – Le Vigan
      '102',  // Ganges – Saint-Roman-de-Codieres
      '103',  // Pompignan – Saint-Hippolyte-du-Fort
      '104',  // Le Vigan – Arphy
      '105',  // Vissec – Le Vigan
      '106',  // Saint-Andre-de-Majencoules – Le Vigan
      '108',  // Le Vigan – Treves
      '140',  // Le Vigan – Nimes
      '142',  // Le Vigan – Ales
      '608',  // Montpellier – Ganges – Le Vigan
    ],
  },
  {
    territoire: 'pau',
    nom: 'Reseau interurbain des Pyrenees-Atlantiques',
    url: 'https://www.pigma.org/public/opendata/nouvelle_aquitaine_mobilites/publication/pyrenees_atlantiques-aggregated-gtfs.zip',
    /*
     * LES QUINZE, ET C'EST TOUT LE FLUX. Mesure sur le fichier : 15 lignes,
     * 763 arrets, 174 courses, 1 Mo. Toutes desservent un arret a moins de
     * 45 km de Pau — le flux est deja celui du departement, il n'y a rien a
     * ecarter. On les nomme quand meme : une ligne ajoutee par l'exploitant
     * demain doit etre un choix, pas une surprise.
     */
    lignes: [
      '520',  // Pau – Orthez
      '521',  // Pau – Monein
      '522',  // Pau – Artix – Mourenx
      '523',  // Orthez – Saint-Palais
      '524',  // Pau – Gourette
      '525',  // Laruns – Artouste – Col du Pourtalet
      '530',  // Pau/Aire-sur-l'Adour – Mont-de-Marsan
      '531',  // Pau – Agen
      '532',  // Pau – Crouseilles
      '533',  // Pau – Pontacq
      '534',  // Pau – Asson – Bruges
      '535',  // Pau – Montaut
      '550',  // Bedous – Canfranc
      '551',  // Oloron – Arette
      '552',  // Oloron – Mauleon
    ],
  },
]

/** Le reseau d'un territoire, par son slug. */
export function reseauDe(slug: string | null | undefined): ReseauGtfs | null {
  return RESEAUX.find(r => r.territoire === slug) ?? null
}

export interface ResultatImport {
  lignes: number
  arrets: number
  courses: number
  passages: number
  traces: number
  services: number
  exceptions: number
  secondes: number
}

/** Découpe une ligne CSV en respectant les guillemets. */
function champs(ligne: string): string[] {
  const out: string[] = []
  let courant = ''
  let entreGuillemets = false
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i]
    if (c === '"') {
      if (entreGuillemets && ligne[i + 1] === '"') { courant += '"'; i++ }
      else entreGuillemets = !entreGuillemets
    } else if (c === ',' && !entreGuillemets) {
      out.push(courant); courant = ''
    } else courant += c
  }
  out.push(courant)
  return out
}

/**
 * Parcourt un CSV du GTFS sans jamais le materialiser en tableau.
 * `visiter` recoit un objet colonne → valeur pour chaque ligne.
 */
function parcourir(texte: string, visiter: (l: Record<string, string>) => void): void {
  // \r\n comme \n : le GTFS melange les deux selon les producteurs.
  const lignes = texte.split(/\r?\n/)
  if (lignes.length === 0) return
  // Le BOM UTF-8 collerait au nom de la premiere colonne et casserait tout.
  const entetes = champs(lignes[0].replace(/^﻿/, ''))
  const obj: Record<string, string> = {}
  for (let i = 1; i < lignes.length; i++) {
    if (!lignes[i]) continue
    const v = champs(lignes[i])
    for (let j = 0; j < entetes.length; j++) obj[entetes[j]] = v[j] ?? ''
    visiter(obj)
  }
}

/** Insere par paquets : au-dela, PostgREST refuse la charge. */
async function ecrire(table: string, rangs: Record<string, unknown>[], conflit: string): Promise<void> {
  const PAQUET = 500
  for (let i = 0; i < rangs.length; i += PAQUET) {
    const { error } = await supabaseAdmin
      .from(table)
      .upsert(rangs.slice(i, i + PAQUET), { onConflict: conflit })
    if (error) throw new Error(`${table} : ${error.message}`)
  }
}

/** Convertit une date GTFS (AAAAMMJJ) en date ISO. */
function dateGtfs(v: string): string {
  return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`
}

export interface RangsGtfs {
  lignes: Record<string, unknown>[]
  arrets: Record<string, unknown>[]
  traces: Record<string, unknown>[]
  services: Record<string, unknown>[]
  exceptions: Record<string, unknown>[]
  courses: Record<string, unknown>[]
  passages: Record<string, unknown>[]
}

/**
 * Lit l'archive et en tire les rangs a ecrire. AUCUN acces base : c'est ce
 * qui rend cette etape verifiable seule, avec un fichier sous la main.
 */
/**
 * Reconnait une ligne retenue.
 *
 * Deux exploitants, deux facons de nommer : liO donne `route_id = '101'`, le
 * Bearn donne `route_id = 'PYRENEES_ATLANTIQUES:Line:3448'` et
 * `route_short_name = '520'`. On declare les lignes par le NUMERO qu'on lit
 * sur le car ; on accepte les deux pour que les reseaux deja branches ne
 * changent pas de comportement.
 */
function estRetenue(r: { route_id?: string; route_short_name?: string }, retenues: Set<string>): boolean {
  if (!retenues.size) return true     // flux deja restreint au territoire
  return retenues.has(r.route_id ?? '') || retenues.has(r.route_short_name ?? '')
}

export function extraireGtfs(archive: Uint8Array, lignes: string[]): RangsGtfs {
  const zip = unzipSync(archive)

  const texte = (nom: string): string => {
    const f = zip[nom]
    if (!f) throw new Error(`Fichier absent de l'archive : ${nom}`)
    return new TextDecoder('utf-8').decode(f)
  }

  const retenues = new Set(lignes)

  // 1. Les lignes.
  const rangsLignes: Record<string, unknown>[] = []
  parcourir(texte('routes.txt'), r => {
    if (!estRetenue(r, retenues)) return
    rangsLignes.push({
      route_id: r.route_id,
      nom_court: r.route_short_name || null,
      nom_long: r.route_long_name || null,
      couleur: r.route_color ? `#${r.route_color}` : null,
      couleur_texte: r.route_text_color ? `#${r.route_text_color}` : null,
      maj: new Date().toISOString(),
    })
  })
  if (rangsLignes.length === 0) throw new Error(`Aucune ligne trouvee parmi : ${lignes.join(', ')}`)
  const idsRetenus = new Set(rangsLignes.map(l => String(l.route_id)))

  // 2. Les courses — et au passage les services et traces utiles.
  const idsCourses = new Set<string>()
  const idsServices = new Set<string>()
  const idsTraces = new Set<string>()
  const rangsCourses: Record<string, unknown>[] = []
  parcourir(texte('trips.txt'), t => {
    // `trips.txt` ne porte pas le numero affiche : on s'appuie sur les
    // identifiants des lignes effectivement retenues juste au-dessus.
    if (!idsRetenus.has(t.route_id)) return
    idsCourses.add(t.trip_id)
    idsServices.add(t.service_id)
    if (t.shape_id) idsTraces.add(t.shape_id)
    rangsCourses.push({
      trip_id: t.trip_id,
      route_id: t.route_id,
      service_id: t.service_id,
      shape_id: t.shape_id || null,
      sens: t.direction_id === '' ? null : Number(t.direction_id),
      destination: t.trip_headsign || null,
    })
  })

  // 3. Les passages — le gros fichier, filtre au vol.
  const idsArrets = new Set<string>()
  const rangsPassages: Record<string, unknown>[] = []
  parcourir(texte('stop_times.txt'), p => {
    if (!idsCourses.has(p.trip_id)) return
    idsArrets.add(p.stop_id)
    rangsPassages.push({
      trip_id: p.trip_id,
      ordre: Number(p.stop_sequence),
      stop_id: p.stop_id,
      arrivee: p.arrival_time || null,
      depart: p.departure_time || null,
    })
  })

  // 4. Les arrets. Sans coordonnees, un arret ne sert a rien ici : on l'ecarte
  //    plutot que de poser un point a (0,0), au large du Ghana.
  const rangsArrets: Record<string, unknown>[] = []
  parcourir(texte('stops.txt'), s => {
    if (!idsArrets.has(s.stop_id)) return
    const lat = Number(s.stop_lat), lng = Number(s.stop_lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    rangsArrets.push({ stop_id: s.stop_id, nom: s.stop_name || s.stop_id, lat, lng })
  })

  // 5. Les traces — 75 Mo a parcourir, un seul rang par trace en sortie.
  const parTrace = new Map<string, [number, number, number][]>()
  parcourir(texte('shapes.txt'), s => {
    if (!idsTraces.has(s.shape_id)) return
    const lat = Number(s.shape_pt_lat), lng = Number(s.shape_pt_lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    const l = parTrace.get(s.shape_id) ?? []
    l.push([Number(s.shape_pt_sequence), lng, lat])
    parTrace.set(s.shape_id, l)
  })
  const rangsTraces = Array.from(parTrace.entries()).map(([shape_id, pts]) => ({
    shape_id,
    // Trie par la sequence du GTFS : l'ordre du fichier n'est pas garanti, et
    // des points dans le desordre dessinent un gribouillis.
    points: pts.sort((a, b) => a[0] - b[0]).map(([, lng, lat]) => [lng, lat]),
  }))

  // 6. Les calendriers.
  const rangsServices: Record<string, unknown>[] = []
  parcourir(texte('calendar.txt'), c => {
    if (!idsServices.has(c.service_id)) return
    const jour = (v: string) => v === '1'
    rangsServices.push({
      service_id: c.service_id,
      lundi: jour(c.monday), mardi: jour(c.tuesday), mercredi: jour(c.wednesday),
      jeudi: jour(c.thursday), vendredi: jour(c.friday), samedi: jour(c.saturday),
      dimanche: jour(c.sunday),
      debut: dateGtfs(c.start_date),
      fin: dateGtfs(c.end_date),
    })
  })

  // Les exceptions : un ferie qui supprime le service, un renfort qui en
  // ajoute un. Sans elles, on annoncerait des bus qui ne roulent pas.
  const rangsExceptions: Record<string, unknown>[] = []
  if (zip['calendar_dates.txt']) {
    parcourir(texte('calendar_dates.txt'), e => {
      if (!idsServices.has(e.service_id)) return
      rangsExceptions.push({
        service_id: e.service_id,
        jour: dateGtfs(e.date),
        ajoute: e.exception_type === '1',
      })
    })
  }

  return {
    lignes: rangsLignes,
    arrets: rangsArrets,
    traces: rangsTraces,
    services: rangsServices,
    exceptions: rangsExceptions,
    courses: rangsCourses,
    passages: rangsPassages,
  }
}

export async function importerReseau(
  reseau: ReseauGtfs,
  lignesDemandees?: string[],
): Promise<ResultatImport> {
  const debut = Date.now()

  const rep = await fetch(reseau.url)
  if (!rep.ok) throw new Error(`Telechargement GTFS (${reseau.nom}) : HTTP ${rep.status}`)
  const r = extraireGtfs(new Uint8Array(await rep.arrayBuffer()),
    lignesDemandees && lignesDemandees.length ? lignesDemandees : reseau.lignes)

  /*
   * LE TERRITOIRE EST POSE ICI, sur chaque ligne. Tout en decoule : les
   * courses, les passages et les arrets se rattachent aux lignes, et c'est
   * `territoire_id` qui empeche la carte de Ganges de dessiner les cars du
   * Bearn. Sans lui, la valeur par defaut en base les rendrait cevenols.
   */
  const terr = await territoireParSlug(reseau.territoire)
  if (terr) for (const l of r.lignes) l.territoire_id = terr.id

  // L'ordre compte : les courses referencent les lignes, les passages
  // referencent les courses.
  await ecrire('transport_lignes', r.lignes, 'route_id')
  await ecrire('transport_arrets', r.arrets, 'stop_id')
  await ecrire('transport_traces', r.traces, 'shape_id')
  await ecrire('transport_services', r.services, 'service_id')
  await ecrire('transport_services_exceptions', r.exceptions, 'service_id,jour')
  await ecrire('transport_courses', r.courses, 'trip_id')
  await ecrire('transport_passages', r.passages, 'trip_id,ordre')

  return {
    lignes: r.lignes.length,
    arrets: r.arrets.length,
    courses: r.courses.length,
    passages: r.passages.length,
    traces: r.traces.length,
    services: r.services.length,
    exceptions: r.exceptions.length,
    secondes: Math.round((Date.now() - debut) / 100) / 10,
  }
}
