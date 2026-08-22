import { supabaseAdmin } from '@/lib/supabase-admin'
import { CINEMA_FIELDS, type Cinema, type Film } from '@/lib/cinema'
import { detailsFilm } from '@/lib/tmdb'

/** Ligne brute de `films`, avec les colonnes TMDB. */
export type FilmRow = Film & {
  tmdb_id: number | null
  metadata_source: string
  backdrop_url: string | null
  date_sortie: string | null
}

/**
 * MODULE CINÉMA — accès base, SERVEUR UNIQUEMENT.
 *
 * Séparé de cinema.ts parce que ce fichier importe `supabase-admin`, qui
 * porte la clé service : importé depuis un composant client, il construit un
 * client Supabase sans clé et fait planter la page. Ne jamais l'importer
 * ailleurs que dans une route d'API.
 */

/**
 * La fiche est-elle un cinéma actif, et cette personne peut-elle l'administrer ?
 *
 * À appeler CÔTÉ SERVEUR avant toute écriture : masquer un bouton dans l'UI
 * n'est pas une garde. L'admin de l'app passe partout.
 */
export async function peutAdministrerCinema(
  etablissementId: string,
  userId: string,
  isAdmin: boolean,
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('etablissements')
    .select('user_id, plan, module_cinema')
    .eq('id', etablissementId)
    .maybeSingle()
  if (!data?.module_cinema) return false
  if (isAdmin) return true
  return data.user_id === userId && data.plan === 'pro'
}

/** Les fiches ayant le module accordé. Vide tant que rien n'est accordé. */
export async function listerCinemas(): Promise<Cinema[]> {
  const { data } = await supabaseAdmin
    .from('etablissements')
    .select(CINEMA_FIELDS)
    .eq('module_cinema', true)
    .order('nom')
  return (data ?? []) as Cinema[]
}

/**
 * Les salles que cette personne peut administrer, dans l'ordre des noms.
 *
 * L'admin de l'app les voit toutes : sans sélecteur, l'écran « Mon cinéma »
 * ouvrait toujours la PREMIÈRE par ordre alphabétique, et la deuxième salle
 * restait inatteignable.
 */
export async function sallesAdministrables(
  userId: string,
  isAdmin: boolean,
): Promise<Cinema[]> {
  const cinemas = await listerCinemas()
  const retenues: Cinema[] = []
  for (const c of cinemas) {
    if (await peutAdministrerCinema(c.id, userId, isAdmin)) retenues.push(c)
  }
  return retenues
}

/**
 * Ce film entre au catalogue de cette salle.
 *
 * Idempotent : la clé primaire composite tranche, réajouter un film déjà au
 * catalogue ne fait rien. À appeler à CHAQUE résolution, création comme
 * réutilisation — c'est la réutilisation qui posait problème.
 */
export async function lierFilmAuCinema(filmId: string, cinemaId: string): Promise<void> {
  await supabaseAdmin
    .from('cinema_films')
    .upsert({ etablissement_id: cinemaId, film_id: filmId }, {
      onConflict: 'etablissement_id,film_id',
      ignoreDuplicates: true,
    })
}

/**
 * Les identifiants des films de cette salle.
 *
 * Le catalogue explicite, PLUS les films qu'elle programme : ces derniers
 * sont le filet si un lien manque (séance importée avant la table, ligne
 * effacée à la main). Une salle doit toujours voir ce qu'elle joue.
 */
export async function filmsDuCinema(cinemaId: string): Promise<string[]> {
  const [cat, seances] = await Promise.all([
    supabaseAdmin.from('cinema_films').select('film_id').eq('etablissement_id', cinemaId),
    supabaseAdmin.from('seances').select('film_id').eq('etablissement_id', cinemaId),
  ])
  return Array.from(new Set([
    ...(cat.data ?? []).map(r => r.film_id as string),
    ...(seances.data ?? []).map(r => r.film_id as string),
  ]))
}

/**
 * Trouve ou crée NOTRE fiche film à partir d'un identifiant TMDB.
 *
 * Point d'entrée unique : l'ajout manuel, l'import d'une affiche et la dictée
 * appelleront tous celui-ci. Il ne doit donc y avoir qu'une seule logique de
 * déduplication dans le projet, pas une par écran.
 *
 * Ordre de recherche :
 *   1. même tmdb_id → on réutilise, quel que soit le cinéma qui l'a créé.
 *      C'est ce qui permettra au Vigan de programmer le « Dune » de Ganges
 *      sans dupliquer la fiche ;
 *   2. même titre ET même année → une fiche saisie à la main avant l'arrivée
 *      de TMDB : on l'adopte et on l'enrichit plutôt que de créer un doublon ;
 *   3. sinon création.
 *
 * Le titre SEUL ne suffit jamais : « Dune » existe en 1984 et en 2021, et les
 * confondre transférerait la programmation au mauvais film.
 */
export async function resoudreFilm(
  tmdbId: number,
  cinemaId: string,
): Promise<{ film: FilmRow; reutilise: boolean }> {
  const r = await trouverOuCreerFilm(tmdbId, cinemaId)
  // Le lien vaut aussi — surtout — quand la fiche est réutilisée : sans lui,
  // la salle s'entend répondre « ce film existe déjà » et ne le voit jamais
  // apparaître dans ses films.
  await lierFilmAuCinema(r.film.id, cinemaId)
  return r
}

async function trouverOuCreerFilm(
  tmdbId: number,
  cinemaId: string,
): Promise<{ film: FilmRow; reutilise: boolean }> {
  const { data: parTmdb } = await supabaseAdmin
    .from('films').select('*').eq('tmdb_id', tmdbId).maybeSingle()
  if (parTmdb) return { film: parTmdb as FilmRow, reutilise: true }

  const d = await detailsFilm(tmdbId)

  const champs = {
    titre:             d.titre,
    titre_original:    d.titreOriginal,
    annee:             d.annee,
    date_sortie:       d.dateSortie,
    duree_min:         d.dureeMin,
    realisateur:       d.realisateur,
    casting:           d.casting,
    genres:            d.genres.length ? d.genres : null,
    synopsis:          d.synopsis,
    affiche_url:       d.afficheUrl,
    backdrop_url:      d.backdropUrl,
    bande_annonce_url: d.bandeAnnonceUrl,
    avertissement:     d.avertissement,
    tmdb_id:           d.tmdbId,
    metadata_source:   'tmdb',
  }

  if (d.annee != null) {
    const { data: parTitre } = await supabaseAdmin
      .from('films').select('*')
      .ilike('titre', d.titre).eq('annee', d.annee).is('tmdb_id', null)
      .maybeSingle()
    if (parTitre) {
      // Fiche saisie à la main : on la complète sans écraser ce que
      // l'exploitant a déjà renseigné lui-même.
      const maj: Record<string, unknown> = { tmdb_id: d.tmdbId, metadata_source: 'tmdb', updated_at: new Date().toISOString() }
      for (const [k, v] of Object.entries(champs)) {
        if (v != null && !(parTitre as Record<string, unknown>)[k]) maj[k] = v
      }
      const { data: maj2 } = await supabaseAdmin
        .from('films').update(maj).eq('id', (parTitre as FilmRow).id).select('*').single()
      return { film: (maj2 ?? parTitre) as FilmRow, reutilise: true }
    }
  }

  const { data, error } = await supabaseAdmin
    .from('films').insert({ ...champs, cree_par: cinemaId }).select('*').single()
  if (error) throw new Error(error.message)
  return { film: data as FilmRow, reutilise: false }
}
