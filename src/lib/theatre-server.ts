import { supabaseAdmin } from '@/lib/supabase-admin'
import { THEATRE_FIELDS, type Theatre, type Spectacle, type Representation } from '@/lib/theatre'
import { dateParis } from '@/lib/cinema'

/**
 * MODULE THÉÂTRE — accès base, SERVEUR UNIQUEMENT.
 *
 * Séparé de `theatre.ts` parce que ce fichier importe `supabase-admin`, qui
 * porte la clé service : importé depuis un composant client, il construit un
 * client Supabase sans clé et fait planter la page. Ne jamais l'importer
 * ailleurs que dans une route d'API.
 */

/**
 * Cette fiche est-elle un théâtre actif, et cette personne peut-elle
 * l'administrer ?
 *
 * À appeler CÔTÉ SERVEUR avant toute écriture : masquer un bouton dans
 * l'interface n'a jamais protégé une table.
 */
export async function peutAdministrerTheatre(
  etablissementId: string,
  userId: string | null,
  isAdmin: boolean,
): Promise<boolean> {
  if (!etablissementId) return false
  const { data } = await supabaseAdmin
    .from('etablissements')
    .select('user_id, plan, module_theatre, statut')
    .eq('id', etablissementId)
    .maybeSingle()
  if (!data || data.module_theatre !== true || data.statut !== 'actif') return false
  if (isAdmin) return true
  if (!userId) return false
  return data.user_id === userId && data.plan === 'pro'
}

/** Les fiches ayant le module accordé. Vide tant que rien n'est accordé. */
export async function listerTheatres(territoireId?: string | null): Promise<Theatre[]> {
  // Un théâtre est une fiche établissement : il porte déjà son territoire, et
  // ses représentations suivent leur salle. Filtrer ici suffit donc à
  // cloisonner tout le module.
  let q = supabaseAdmin
    .from('etablissements')
    .select(THEATRE_FIELDS)
    .eq('module_theatre', true)
    .order('nom')
  if (territoireId) q = q.eq('territoire_id', territoireId)
  const { data } = await q
  // Le double transtypage est la contrepartie du select en chaine : PostgREST
  // ne sait pas en deduire la forme, et c'est le meme motif qu'au cinema.
  return (data ?? []) as unknown as Theatre[]
}

/**
 * Ce spectacle existe-t-il déjà, ou faut-il le créer ?
 *
 * POINT D'ENTRÉE UNIQUE de la déduplication des spectacles, comme
 * `resoudreFilm` l'est pour les films. Une compagnie tourne : le même
 * spectacle peut être programmé par deux salles à un an d'intervalle, et il
 * ne doit exister qu'une fois.
 *
 * On reconnaît un spectacle à son TITRE et à sa COMPAGNIE. Le titre seul ne
 * suffit pas — « Paradox », « Garder », « Fils de » sont des titres qu'on
 * peut croiser deux fois ; la compagnie tranche.
 */
export async function resoudreSpectacle(
  champs: Partial<Spectacle> & { titre: string },
  theatreId: string | null,
): Promise<{ spectacle: Spectacle; reutilise: boolean }> {
  const titre = champs.titre.trim()
  let q = supabaseAdmin.from('spectacles').select('*').ilike('titre', titre).limit(1)
  if (champs.compagnie) q = q.ilike('compagnie', champs.compagnie)
  const { data: deja } = await q.maybeSingle()
  if (deja) return { spectacle: deja as Spectacle, reutilise: true }

  const { data: cree } = await supabaseAdmin
    .from('spectacles')
    .insert({ ...champs, titre, ...(theatreId ? { cree_par: theatreId } : {}) })
    .select('*')
    .single()
  return { spectacle: cree as Spectacle, reutilise: false }
}

/**
 * Les salles que cette personne peut administrer, dans l'ordre des noms.
 *
 * L'admin de l'app les voit toutes : sans sélecteur, l'écran « Mon théâtre »
 * ouvrirait toujours la PREMIÈRE par ordre alphabétique.
 */
export async function sallesAdministrables(
  userId: string,
  isAdmin: boolean,
): Promise<Theatre[]> {
  const salles = await listerTheatres()
  const retenues: Theatre[] = []
  for (const s of salles) {
    if (await peutAdministrerTheatre(s.id, userId, isAdmin)) retenues.push(s)
  }
  return retenues
}

/**
 * Une fiche spectacle et toutes ses dates — ce que sert
 * /api/theatre/spectacle/[id], et ce que la fiche serveur met dans son HTML.
 *
 * Les dates PASSÉES sont renvoyées aussi, et c'est la différence avec le
 * cinéma : une séance d'hier n'intéresse personne, un spectacle déjà joué
 * si. On veut pouvoir ouvrir sa fiche et lire ce qui a été programmé.
 *
 * LES LIEUX DE JEU HORS LES MURS. Une saison de village ne se joue pas que
 * dans la salle : « Garder » se donne aux Belvédères de Blandas, « Pixel » à
 * l'Opéra Berlioz. `representations.lieu` porte le nom exact écrit au
 * programme ; on le rapproche par NOM de la table `lieux`, où ces salles ont
 * été géocodées une fois pour toutes. Si quelqu'un réécrit le libellé d'une
 * date, l'adresse disparaît — c'est la bonne panne. Un lieu sans
 * correspondance (« Écoles du territoire ») n'en a pas : on n'en invente pas.
 */
export async function lireSpectacle(id: string) {
  const { data: spRow } = await supabaseAdmin
    .from('spectacles').select('*').eq('id', id).maybeSingle()
  if (!spRow) return null

  const { data: repRows } = await supabaseAdmin
    .from('representations')
    .select('id, etablissement_id, spectacle_id, date, heure, lieu, scolaire, billetterie_url, note')
    .eq('spectacle_id', id)
    .order('date')
    .order('heure')

  // Toutes les salles, pour nommer celle de chaque date : un spectacle peut
  // tourner, et la fiche doit dire OÙ.
  const theatres = await listerTheatres()

  const nomsLieux = Array.from(new Set(
    (repRows ?? []).map(r => r.lieu).filter(Boolean) as string[]))
  const { data: lieuxRows } = nomsLieux.length
    ? await supabaseAdmin.from('lieux')
        .select('id, nom, adresse, commune, lat, lng')
        .in('nom', nomsLieux)
    : { data: [] }

  return {
    spectacle: spRow as Spectacle,
    representations: (repRows ?? []) as Representation[],
    theatres,
    lieux: (lieuxRows ?? []) as { id: string; nom: string; adresse: string | null; commune: string | null; lat: number | null; lng: number | null }[],
    aujourdhui: dateParis(),
  }
}
