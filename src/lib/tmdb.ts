/**
 * TMDB — recherche et enrichissement des fiches films. SERVEUR UNIQUEMENT.
 *
 * TMDB sert à TROUVER un film et à préremplir notre fiche. Notre table `films`
 * reste la source de vérité : les séances pointent `film_id`, jamais un
 * identifiant TMDB. Changer de fournisseur ne toucherait aucune programmation.
 *
 * ⚠️ Ne jamais importer depuis un composant client : le jeton est un secret
 * serveur (pas de préfixe NEXT_PUBLIC_, c'est ce préfixe et lui seul qui
 * expose une variable au navigateur).
 *
 * Authentification : Bearer dans l'en-tête, comme le veut l'API v4 — la clé
 * ne passe donc jamais dans une URL, ni dans un log de requête.
 */

const BASE = 'https://api.themoviedb.org/3'
const IMG  = 'https://image.tmdb.org/t/p'

/**
 * Tailles d'images. Surtout pas `original` : une affiche s'affiche au plus sur
 * 122 points (244 px en haute densité), et `original` pèse plusieurs Mo — sur
 * le réseau de la vallée c'est rédhibitoire.
 */
const TAILLE_AFFICHE  = 'w342'
const TAILLE_BACKDROP = 'w780'

/** Un exploitant ne doit pas attendre : au-delà, on bascule sur la saisie manuelle. */
const TIMEOUT_MS = 6000

export interface TmdbResultat {
  tmdbId: number
  titre: string
  titreOriginal: string | null
  annee: number | null
  dateSortie: string | null
  afficheUrl: string | null
  synopsis: string | null
}

export interface TmdbFilm extends TmdbResultat {
  dureeMin: number | null
  genres: string[]
  realisateur: string | null
  casting: string | null
  backdropUrl: string | null
  bandeAnnonceUrl: string | null
  avertissement: string | null
}

/** La clé manque-t-elle ? L'appelant doit pouvoir le dire proprement. */
export function tmdbConfigure(): boolean {
  return !!process.env.TMDB_API_TOKEN
}

function imageUrl(chemin: string | null | undefined, taille: string): string | null {
  return chemin ? `${IMG}/${taille}${chemin}` : null
}

async function appel<T>(chemin: string, params: Record<string, string> = {}): Promise<T> {
  const token = process.env.TMDB_API_TOKEN
  if (!token) throw new Error('TMDB_API_TOKEN manquant')

  const url = new URL(`${BASE}${chemin}`)
  // fr-FR : on veut les titres et synopsis français quand ils existent.
  url.searchParams.set('language', 'fr-FR')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const r = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
      signal: ctrl.signal,
    })
    if (!r.ok) throw new Error(`TMDB ${r.status}`)
    return await r.json() as T
  } finally {
    clearTimeout(t)
  }
}

interface RechercheBrute {
  results?: {
    id: number
    title?: string
    original_title?: string
    release_date?: string
    poster_path?: string | null
    overview?: string
    popularity?: number
  }[]
}

/** Recherche par titre. Les plus populaires d'abord — c'est ce qu'on cherche. */
export async function rechercherFilms(requete: string): Promise<TmdbResultat[]> {
  const q = requete.trim()
  if (q.length < 2) return []
  const data = await appel<RechercheBrute>('/search/movie', { query: q, include_adult: 'false' })
  return (data.results ?? [])
    .slice(0, 12)
    .map(r => ({
      tmdbId: r.id,
      titre: r.title || r.original_title || 'Sans titre',
      titreOriginal: r.original_title && r.original_title !== r.title ? r.original_title : null,
      annee: r.release_date ? Number(r.release_date.slice(0, 4)) || null : null,
      dateSortie: r.release_date || null,
      afficheUrl: imageUrl(r.poster_path, TAILLE_AFFICHE),
      synopsis: r.overview || null,
    }))
}

interface Video {
  site?: string
  key?: string
  type?: string
  official?: boolean
  iso_639_1?: string
}

/**
 * Choisit la bande-annonce à retenir.
 *
 * Priorité : français, type Trailer, officielle. On note chaque vidéo plutôt
 * que d'empiler des filtres, pour qu'une vidéo imparfaite l'emporte quand
 * aucune ne coche toutes les cases — mieux vaut une bande-annonce anglaise
 * qu'aucune.
 */
function choisirBandeAnnonce(videos: Video[]): string | null {
  const candidates = videos.filter(v => v.site === 'YouTube' && v.key)
  if (!candidates.length) return null
  const note = (v: Video) =>
    (v.iso_639_1 === 'fr' ? 4 : 0) +
    (v.type === 'Trailer' ? 2 : v.type === 'Teaser' ? 1 : 0) +
    (v.official ? 1 : 0)
  const meilleure = candidates.reduce((a, b) => (note(b) > note(a) ? b : a))
  return `https://www.youtube.com/watch?v=${meilleure.key}`
}

interface DetailsBruts {
  id: number
  title?: string
  original_title?: string
  overview?: string
  runtime?: number | null
  release_date?: string
  poster_path?: string | null
  backdrop_path?: string | null
  genres?: { name: string }[]
  credits?: {
    crew?: { job?: string; name?: string }[]
    cast?: { name?: string }[]
  }
  videos?: { results?: Video[] }
  release_dates?: {
    results?: { iso_3166_1?: string; release_dates?: { certification?: string }[] }[]
  }
}

/**
 * Fiche complète, en UN seul appel grâce à append_to_response — trois
 * allers-retours séparés feraient patienter l'exploitant pour rien.
 */
export async function detailsFilm(tmdbId: number): Promise<TmdbFilm> {
  const d = await appel<DetailsBruts>(`/movie/${tmdbId}`, {
    append_to_response: 'credits,videos,release_dates',
  })

  const realisateur = d.credits?.crew?.find(c => c.job === 'Director')?.name ?? null
  const casting = (d.credits?.cast ?? []).slice(0, 5).map(c => c.name).filter(Boolean).join(', ') || null

  // Classification française quand elle existe. On ne retient que les
  // restrictions d'âge : « Tous publics » n'est pas un avertissement, l'afficher
  // encombrerait la fiche sans rien apprendre.
  const fr = d.release_dates?.results?.find(r => r.iso_3166_1 === 'FR')
  const certif = (fr?.release_dates ?? []).map(x => x.certification?.trim()).find(c => c && /^\d+$/.test(c))

  return {
    tmdbId: d.id,
    titre: d.title || d.original_title || 'Sans titre',
    titreOriginal: d.original_title && d.original_title !== d.title ? d.original_title : null,
    annee: d.release_date ? Number(d.release_date.slice(0, 4)) || null : null,
    dateSortie: d.release_date || null,
    afficheUrl: imageUrl(d.poster_path, TAILLE_AFFICHE),
    backdropUrl: imageUrl(d.backdrop_path, TAILLE_BACKDROP),
    synopsis: d.overview || null,
    dureeMin: d.runtime || null,
    genres: (d.genres ?? []).map(g => g.name).filter(Boolean),
    realisateur,
    casting,
    bandeAnnonceUrl: choisirBandeAnnonce(d.videos?.results ?? []),
    avertissement: certif ? `Interdit aux moins de ${certif} ans` : null,
  }
}

/* ─── Recherche par personne ───────────────────────────────────────────── */

/**
 * Chercher « Will Smith » dans /search/movie ne donne rien : ce point d'entrée
 * ne connaît que les titres. La filmographie d'une personne demande deux
 * appels — la trouver, puis lire ses crédits — d'où ce couple de fonctions.
 */

const TAILLE_PORTRAIT = 'w185'

export interface TmdbPersonne {
  personneId: number
  nom: string
  /** Métier principal selon TMDB, traduit dans nos deux rôles. */
  role: RolePersonne
  portraitUrl: string | null
  /** Deux ou trois titres connus, pour lever le doute entre homonymes. */
  connuPour: string
}

export type RolePersonne = 'realisateur' | 'acteur'

interface PersonneBrute {
  id: number
  name?: string
  known_for_department?: string
  profile_path?: string | null
  popularity?: number
  known_for?: { title?: string; name?: string }[]
}

/** Les personnes portant ce nom, la plus connue d'abord. */
export async function rechercherPersonnes(requete: string): Promise<TmdbPersonne[]> {
  const q = requete.trim()
  if (q.length < 3) return []
  const data = await appel<{ results?: PersonneBrute[] }>('/search/person', {
    query: q, include_adult: 'false',
  })
  return (data.results ?? [])
    .slice(0, 4)
    .map(p => ({
      personneId: p.id,
      nom: p.name || 'Sans nom',
      role: (p.known_for_department === 'Directing' ? 'realisateur' : 'acteur') as RolePersonne,
      portraitUrl: imageUrl(p.profile_path, TAILLE_PORTRAIT),
      connuPour: (p.known_for ?? [])
        .map(k => k.title || k.name).filter(Boolean).slice(0, 3).join(', '),
    }))
}

interface CreditBrut {
  id: number
  title?: string
  original_title?: string
  release_date?: string
  poster_path?: string | null
  overview?: string
  popularity?: number
  job?: string
}

/**
 * La filmographie d'une personne, la plus récente d'abord.
 *
 * En réalisation on ne garde que le poste de metteur en scène : Lucas a
 * produit ou écrit des dizaines de films qu'il n'a pas tournés, et « les films
 * de George Lucas » n'en désigne pas soixante.
 *
 * Les films sans date de sortie sont écartés : ce sont des projets annoncés,
 * jamais programmables dans une salle.
 */
export async function filmsDeLaPersonne(
  personneId: number,
  role: RolePersonne,
  max = 20,
): Promise<TmdbResultat[]> {
  const d = await appel<{ cast?: CreditBrut[]; crew?: CreditBrut[] }>(
    `/person/${personneId}/movie_credits`,
  )
  const bruts = role === 'realisateur'
    ? (d.crew ?? []).filter(c => c.job === 'Director')
    : (d.cast ?? [])

  // Un comédien peut apparaître deux fois sur un même film (deux rôles).
  const vus = new Set<number>()
  return bruts
    .filter(c => {
      if (!c.release_date || vus.has(c.id)) return false
      vus.add(c.id)
      return true
    })
    .sort((a, b) => (b.release_date ?? '').localeCompare(a.release_date ?? ''))
    .slice(0, max)
    .map(c => ({
      tmdbId: c.id,
      titre: c.title || c.original_title || 'Sans titre',
      titreOriginal: c.original_title && c.original_title !== c.title ? c.original_title : null,
      annee: c.release_date ? Number(c.release_date.slice(0, 4)) || null : null,
      dateSortie: c.release_date || null,
      afficheUrl: imageUrl(c.poster_path, TAILLE_AFFICHE),
      synopsis: c.overview || null,
    }))
}
