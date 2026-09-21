import { NextRequest, NextResponse } from 'next/server'
import { territoireDeLaRequete } from '@/lib/territoires'
import { lireConfig } from '@/lib/configTerritoire'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { dateParis } from '@/lib/cinema'
import { parseVisibiliteTheatre, type Spectacle, type Representation } from '@/lib/theatre'
import { listerTheatres } from '@/lib/theatre-server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/theatre — tout ce qu'il faut à l'expérience publique.
 *
 * Sans compte, sans condition. Un seul appel plutôt qu'une cascade : la page
 * a besoin des spectacles à l'affiche et de leurs représentations, et une
 * saison entière tient largement dans une réponse.
 *
 * Query : ?theatre=<slug|id> pour ouvrir directement une salle. Sans
 * paramètre, TOUTES les salles du territoire sont agrégées.
 *
 * Pas de cache CDN : une date ajoutée doit se voir tout de suite.
 */

/**
 * Horizon exposé publiquement.
 *
 * Bien plus large que celui du cinéma, et c'est le métier qui le veut : une
 * saison de théâtre s'annonce en juin pour l'année entière, et le public
 * réserve des mois à l'avance. Couper à trois semaines, comme au cinéma,
 * masquerait les trois quarts du programme.
 */
const JOURS_AFFICHES = 400

export async function GET(req: NextRequest) {
  /*
   * L'EDITORIAL N'EST PAS TERRITORIAL — il vit dans `config`, qui n'a qu'une
   * ligne par cle. Plutot que de servir le reglage des Cevennes a un autre
   * territoire, la cle editoriale se tait : « Pau n'a pas encore de theatre »
   * est vrai, « voici celui des Cevennes » ne l'est pas.
   */
  const terr = await territoireDeLaRequete(req.url)
  const demande = new URL(req.url).searchParams.get('theatre')

  const villageVisibilite = parseVisibiliteTheatre(await lireConfig('theatre_village_public', terr))

  const theatres = await listerTheatres(terr?.id ?? null)
  if (!theatres.length) {
    return NextResponse.json(
      { theatres: [], theatre: null, spectacles: [], representations: [], villageVisibilite },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const aujourdhui = dateParis()
  const fin = dateParis(JOURS_AFFICHES)

  // ?theatre= accepte le slug (lisible, pour les QR) ou l'id. Sans parametre,
  // on n'en choisit AUCUN : on les agrege tous.
  const theatre = demande
    ? theatres.find(t => t.slug === demande || t.id === demande) ?? null
    : null
  const salles = theatre ? [theatre] : theatres
  const sallesIds = salles.map(t => t.id)

  const { data: repRows } = await supabaseAdmin
    .from('representations')
    .select('id, etablissement_id, spectacle_id, date, heure, lieu, scolaire, billetterie_url, note')
    .in('etablissement_id', sallesIds)
    .gte('date', aujourdhui)
    .lte('date', fin)
    .order('date')
    .order('heure')
  const representations = (repRows ?? []) as Representation[]

  /*
   * LA SAISON RESTE VISIBLE MÊME QUAND ELLE EST FINIE.
   *
   * Un cinéma n'a pas de passé : une séance d'hier n'intéresse personne. Une
   * saison de théâtre, si — on veut pouvoir regarder ce qui a été joué, et
   * l'affiche d'un spectacle passé reste une belle page. On renvoie donc
   * aussi les spectacles dont toutes les dates sont derrière nous, et c'est
   * l'écran qui décide de les montrer à part.
   */
  const { data: repPassees } = await supabaseAdmin
    .from('representations')
    .select('id, etablissement_id, spectacle_id, date, heure, lieu, scolaire, billetterie_url, note')
    .in('etablissement_id', sallesIds)
    .lt('date', aujourdhui)
    .order('date', { ascending: false })
    .limit(200)
  const passees = (repPassees ?? []) as Representation[]

  // Deux requêtes plutôt qu'une jointure : les jointures implicites PostgREST
  // échouent silencieusement sur ce projet (piège documenté).
  const ids = Array.from(new Set([...representations, ...passees].map(r => r.spectacle_id)))
  const { data: spRows } = ids.length
    ? await supabaseAdmin.from('spectacles').select('*').in('id', ids)
    : { data: [] }
  const spectacles = (spRows ?? []) as Spectacle[]

  // Les soirées exceptionnelles (ouverture de saison, rencontre) restent des
  // événements du village : on les rappelle ici, elles ne vivent pas dans
  // `representations`.
  const { data: evenements } = await supabaseAdmin
    .from('evenements')
    .select('id, titre, date_debut, heure, image_url, categorie, spectacle_id, lieu_id')
    .in('etablissement_id', sallesIds)
    .eq('statut', 'publie')
    .gte('date_debut', aujourdhui)
    .order('date_debut')
    .limit(20)

  return NextResponse.json({
    theatres,
    // `null` = on regarde toutes les salles à la fois.
    theatre,
    spectacles,
    representations,
    passees,
    evenements: evenements ?? [],
    aujourdhui,
    villageVisibilite,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
