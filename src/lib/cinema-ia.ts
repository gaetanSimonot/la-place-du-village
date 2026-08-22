import Anthropic from '@anthropic-ai/sdk'
import { getPrompt } from '@/lib/prompts-ia'
import { safeJsonParse } from '@/lib/safeJsonParse'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { dateParis, type VersionFilm } from '@/lib/cinema'
import {
  rechercherFilms, rechercherPersonnes, filmsDeLaPersonne,
  type TmdbResultat, type RolePersonne,
} from '@/lib/tmdb'

/**
 * MODULE CINÉMA — la saisie parlée. SERVEUR UNIQUEMENT.
 *
 * Deux entrées : « je cherche le dernier Lilo & Stitch et les films avec Will
 * Smith », et « samedi prochain le Gondry à 17h30 ». Une photo de programme
 * papier passe par la seconde.
 *
 * PARTAGE DES RÔLES, et c'est tout le principe : Claude fait la LANGUE — il
 * découpe la phrase, corrige l'orthographe de la dictée, résout « samedi
 * prochain ». Les FAITS viennent de TMDB et de notre table `films`. Claude ne
 * renvoie jamais un film, seulement de quoi le chercher : c'est ce qui rend
 * impossible qu'un film inventé atteigne la programmation.
 *
 * Les deux prompts vivent en base (`prompts_ia`), éditables depuis
 * /admin/prompts sans redéploiement.
 */

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/** Le modèle de toutes les briques IA du projet : extraction, dictée, dédup. */
const MODELE = 'claude-haiku-4-5-20251001'

type MimeImage = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

/** Le corps du message, avec ou sans image, dans les deux modes. */
function contenu(texte: string | null, image?: string, mime?: string): Anthropic.MessageParam['content'] {
  const intro = texte?.trim()
    ? texte
    : 'Voici la photo du programme. Relève toutes les séances.'
  if (!image) return intro
  return [
    { type: 'text', text: intro },
    { type: 'image', source: { type: 'base64', media_type: (mime || 'image/jpeg') as MimeImage, data: image } },
  ]
}

/* ═══════════════════════════════════════════════════════════════════════
   1. TROUVER DES FILMS
   ═══════════════════════════════════════════════════════════════════════ */

interface RequeteTitre {
  type: 'titre'
  titre: string
  choix: 'premier' | 'dernier' | 'annee' | 'tous'
  annee: number | null
  libelle: string
}
interface RequetePersonne {
  type: 'personne'
  nom: string
  role: RolePersonne
  libelle: string
}
type Requete = RequeteTitre | RequetePersonne

export interface CandidatFilm extends TmdbResultat {
  /** Déjà dans notre table `films` — on le montre, on ne le recrée pas. */
  dejaLa: boolean
}

export interface GroupeCandidats {
  libelle: string
  /** Une demande précise arrive cochée ; une filmographie entière, non. */
  precis: boolean
  films: CandidatFilm[]
  /** Renseigné quand la requête n'a rien donné, pour le dire à l'écran. */
  vide?: string
}

/** Garde-fou : Claude peut rendre un objet mal formé, on ne l'exécute pas. */
function requeteValide(r: unknown): r is Requete {
  if (r == null || typeof r !== 'object') return false
  const o = r as Record<string, unknown>
  if (o.type === 'titre') return typeof o.titre === 'string' && o.titre.trim().length > 0
  if (o.type === 'personne') return typeof o.nom === 'string' && o.nom.trim().length > 0
  return false
}

/** La phrase de l'exploitant → des requêtes exécutables. Aucun film ici. */
async function interpreterRecherche(texte: string): Promise<Requete[]> {
  const systemPrompt = await getPrompt('cinema_films_recherche')
  const reponse = await anthropic.messages.create({
    model: MODELE,
    max_tokens: 1024,
    temperature: 0,
    system: systemPrompt,
    messages: [{ role: 'user', content: texte }],
  })
  const brut = reponse.content[0]?.type === 'text' ? reponse.content[0].text : '[]'
  const parse = safeJsonParse<unknown>(brut)
  const arr = Array.isArray(parse) ? parse : parse != null ? [parse] : []
  return arr.filter(requeteValide)
}

/** Casse, accents, ponctuation et « & » écrasés — « Lilo et Stitch » = « Lilo & Stitch ». */
function normaliser(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' et ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Les résultats qui parlent vraiment du film demandé.
 *
 * TMDB ratisse large : « Dune » ramène aussi « Jodorowsky's Dune », un
 * documentaire de 2013. Sans ce filtre, « le dernier Dune » pourrait tomber
 * dessus. On garde donc les titres qui COMMENCENT par la demande — ce qui
 * retient « Dune, deuxième partie », précisément ce que « le dernier »
 * désigne dans la bouche d'un exploitant.
 *
 * Aucun résultat ne passe le filtre ? On rend la liste entière : mieux vaut
 * une proposition discutable qu'un écran vide.
 */
function pertinents(resultats: TmdbResultat[], titre: string): TmdbResultat[] {
  const q = normaliser(titre)
  if (!q) return resultats
  const gardes = resultats.filter(f =>
    normaliser(f.titre).startsWith(q) || normaliser(f.titreOriginal ?? '').startsWith(q))
  return gardes.length ? gardes : resultats
}

/**
 * « le premier », « le dernier », « celui de 2021 » — appliqués à la liste
 * rendue par TMDB, jamais devinés par le modèle.
 *
 * TMDB trie par popularité : sur « Dune », la plus populaire n'est pas la plus
 * récente. Il faut donc retrier par date pour que « le dernier » ait un sens.
 */
function appliquerChoix(resultats: TmdbResultat[], r: RequeteTitre): TmdbResultat[] {
  const cibles = pertinents(resultats, r.titre)
  const parDate = cibles.filter(f => f.dateSortie)
    .sort((a, b) => (a.dateSortie ?? '').localeCompare(b.dateSortie ?? ''))

  // Aucune date connue : le tri n'a plus de sens, on rend le plus populaire.
  if (!parDate.length) return cibles.slice(0, 1)

  if (r.choix === 'premier') return parDate.slice(0, 1)
  if (r.choix === 'dernier') {
    // Une sortie à venir n'est pas « le dernier » sorti tant qu'elle n'existe
    // pas : on s'arrête à aujourd'hui, et à défaut on prend le plus récent.
    const aujourdhui = dateParis()
    const sortis = parDate.filter(f => (f.dateSortie ?? '') <= aujourdhui)
    return (sortis.length ? sortis : parDate).slice(-1)
  }
  if (r.choix === 'annee' && r.annee) {
    const exact = cibles.filter(f => f.annee === r.annee)
    if (exact.length) return exact.slice(0, 3)
  }
  return cibles.slice(0, 6)
}

/** Exécute une requête contre TMDB. Une requête ratée n'annule pas les autres. */
async function executerRequete(r: Requete): Promise<GroupeCandidats> {
  const libelle = r.libelle?.trim() || (r.type === 'titre' ? r.titre : r.nom)

  if (r.type === 'titre') {
    const resultats = await rechercherFilms(r.titre)
    if (!resultats.length) return { libelle, precis: true, films: [], vide: 'Aucun film de ce titre.' }
    const retenus = appliquerChoix(resultats, r)
    return {
      libelle,
      // « tous » sur un titre reste une demande ciblée quand il n'y a qu'un film.
      precis: r.choix !== 'tous' || retenus.length === 1,
      films: retenus.map(f => ({ ...f, dejaLa: false })),
    }
  }

  const personnes = await rechercherPersonnes(r.nom)
  if (!personnes.length) return { libelle, precis: false, films: [], vide: `« ${r.nom} » introuvable.` }
  // Le rôle dicté prime sur le métier deviné par TMDB : « les films DE X » veut
  // dire réalisateur même si TMDB classe la personne comme comédienne.
  const films = await filmsDeLaPersonne(personnes[0].personneId, r.role, 15)
  if (!films.length) {
    const autre: RolePersonne = r.role === 'realisateur' ? 'acteur' : 'realisateur'
    const repli = await filmsDeLaPersonne(personnes[0].personneId, autre, 15)
    if (repli.length) {
      return {
        libelle: `${personnes[0].nom} — ${autre === 'acteur' ? 'comme actrice ou acteur' : 'comme réalisation'}`,
        precis: false,
        films: repli.map(f => ({ ...f, dejaLa: false })),
      }
    }
    return { libelle, precis: false, films: [], vide: 'Aucun film trouvé pour cette personne.' }
  }
  return { libelle, precis: false, films: films.map(f => ({ ...f, dejaLa: false })) }
}

/** Marque les films que notre base connaît déjà — en une seule requête. */
async function annoterCatalogue(groupes: GroupeCandidats[]): Promise<GroupeCandidats[]> {
  const ids = Array.from(new Set(groupes.flatMap(g => g.films.map(f => f.tmdbId))))
  if (!ids.length) return groupes
  const { data } = await supabaseAdmin.from('films').select('tmdb_id').in('tmdb_id', ids)
  const connus = new Set((data ?? []).map(f => f.tmdb_id))
  return groupes.map(g => ({ ...g, films: g.films.map(f => ({ ...f, dejaLa: connus.has(f.tmdbId) })) }))
}

/** Point d'entrée du mode « trouver des films ». */
export async function trouverFilms(texte: string): Promise<GroupeCandidats[]> {
  const requetes = await interpreterRecherche(texte)
  if (!requetes.length) return []
  // Séquentiel : quatre requêtes au plus, et TMDB n'aime pas les rafales.
  const groupes: GroupeCandidats[] = []
  for (const r of requetes.slice(0, 6)) {
    try {
      groupes.push(await executerRequete(r))
    } catch {
      groupes.push({
        libelle: r.libelle || 'Recherche',
        precis: false, films: [], vide: 'Recherche indisponible.',
      })
    }
  }
  return annoterCatalogue(groupes)
}

/* ═══════════════════════════════════════════════════════════════════════
   2. LE PROGRAMME
   ═══════════════════════════════════════════════════════════════════════ */

export interface FilmCatalogue {
  id: string
  titre: string
  annee: number | null
  realisateur: string | null
}

export interface SeanceProposee {
  /** Un film de notre base, ou null s'il faut d'abord le créer. */
  film_id: string | null
  /** Le titre à chercher quand le film manque. */
  recherche: string | null
  libelle: string
  date: string
  heure: string
  version: VersionFilm
  salle: string | null
  note: string | null
}

const VERSIONS_OK: VersionFilm[] = ['vf', 'vost', 'vo']

/**
 * Une séance rendue par Claude n'entre dans l'écran que si elle tient debout.
 *
 * Le `film_id` est le point sensible : il doit venir du catalogue envoyé dans
 * le prompt. Un identifiant inventé, ou celui du catalogue d'un autre cinéma,
 * est ramené à null — la séance devient « film à choisir » plutôt que de
 * pointer sur le mauvais film.
 */
function normaliserSeance(brut: unknown, ids: Set<string>, plancher: string): SeanceProposee | null {
  if (brut == null || typeof brut !== 'object') return null
  const o = brut as Record<string, unknown>

  const date = typeof o.date === 'string' ? o.date.trim() : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < plancher) return null

  const heureBrute = typeof o.heure === 'string' ? o.heure.trim() : ''
  const m = heureBrute.match(/^(\d{1,2}):(\d{2})/)
  if (!m || Number(m[1]) > 23) return null
  const heure = `${m[1].padStart(2, '0')}:${m[2]}`

  const filmId = typeof o.film_id === 'string' && ids.has(o.film_id) ? o.film_id : null
  const recherche = typeof o.recherche === 'string' && o.recherche.trim() ? o.recherche.trim() : null
  // Sans film connu ni titre à chercher, la ligne n'est rattachable à rien.
  if (!filmId && !recherche) return null

  const texteCourt = (v: unknown, max: number) =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null

  return {
    film_id: filmId,
    recherche: filmId ? null : recherche,
    libelle: texteCourt(o.libelle, 120) ?? recherche ?? 'Film',
    date,
    heure,
    version: VERSIONS_OK.includes(o.version as VersionFilm) ? o.version as VersionFilm : 'vf',
    salle: texteCourt(o.salle, 60),
    note: texteCourt(o.note, 120),
  }
}

/**
 * Point d'entrée du mode « programme » — dictée, texte ou photo.
 *
 * `ignorees` compte les lignes écartées à la validation (date illisible, heure
 * absurde, rien à rattacher). On le remonte jusqu'à l'écran : une séance qui
 * disparaît sans un mot se lit comme « l'app n'a pas entendu », et l'exploitant
 * ne saura pas qu'il doit la ressaisir.
 */
export async function lireProgramme(
  texte: string | null,
  catalogue: FilmCatalogue[],
  image?: string,
  imageMime?: string,
): Promise<{ seances: SeanceProposee[]; ignorees: number }> {
  const liste = catalogue.length
    ? catalogue
        .map(f => `${f.id} | ${f.titre}${f.annee ? ` (${f.annee})` : ''}${f.realisateur ? ` — ${f.realisateur}` : ''}`)
        .join('\n')
    : '(le catalogue est vide : tous les films devront être cherchés)'

  const aujourdhui = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date())

  const systemPrompt = await getPrompt('cinema_programme', {
    today: `${aujourdhui} (${dateParis()})`,
    catalogue: liste,
  })

  const reponse = await anthropic.messages.create({
    model: MODELE,
    max_tokens: 8192,
    temperature: 0,
    system: systemPrompt,
    messages: [{ role: 'user', content: contenu(texte, image, imageMime) }],
  })

  const brut = reponse.content[0]?.type === 'text' ? reponse.content[0].text : '[]'
  const parse = safeJsonParse<unknown>(brut)
  const arr = Array.isArray(parse) ? parse : parse != null ? [parse] : []

  const ids = new Set(catalogue.map(f => f.id))
  // La veille comme plancher : une séance d'hier soir n'a plus lieu d'être
  // saisie, mais on ne rejette pas une séance du jour pour un fuseau horaire.
  const plancher = dateParis(-1)
  const seances = arr
    .map(s => normaliserSeance(s, ids, plancher))
    .filter((s): s is SeanceProposee => s !== null)
    .sort((a, b) => (a.date + a.heure).localeCompare(b.date + b.heure))

  return { seances, ignorees: arr.length - seances.length }
}
