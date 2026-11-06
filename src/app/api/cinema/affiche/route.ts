import { NextRequest, NextResponse } from 'next/server'
import { territoireDeLaRequete } from '@/lib/territoires'
import { lireConfig } from '@/lib/configTerritoire'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { dateParis, parseVisibilite, type FilmAffiche, type Seance } from '@/lib/cinema'
import { listerCinemas } from '@/lib/cinema-server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/cinema/affiche — l'affiche du moment, TOUTES SALLES CONFONDUES.
 *
 * Le bloc du Village s'appuyait au départ sur /api/cinema, qui répond pour UNE
 * salle et retenait la première par ordre alphabétique. Dès qu'une deuxième
 * fiche a reçu le module, le bloc s'est mis à interroger une salle sans
 * programmation et disparaissait — alors qu'un cinéma jouait le soir même.
 *
 * L'accueil ne montre pas « un » cinéma, et il ne montre pas non plus le seul
 * programme du jour : un cinéma fermé le mardi joue quand même les mêmes films
 * cette semaine. D'où cette route, qui regarde l'horizon complet mais ne
 * renvoie que les films à l'affiche et le compte des séances du jour — le
 * détail des horaires vit sur /cinema et sur la fiche film.
 */

/** Horizon de programmation, aligné sur celui de l'expérience publique. */
const JOURS_AFFICHES = 21
/** Plafond de lignes de PostgREST. */
const PAGE = 1000

export async function GET(req: NextRequest) {
  // L'affiche du territoire regarde : ses salles, sa visibilite.
  const terr = await territoireDeLaRequete(req.url)
  const villageVisibilite = parseVisibilite(await lireConfig('cinema_village_public', terr))

  const aujourdhui = dateParis()
  const cinemas = await listerCinemas(terr?.id ?? null)
  if (!cinemas.length) {
    return NextResponse.json({ villageVisibilite, aujourdhui, cinemas: [], films: [], seancesAujourdhui: 0 })
  }

  /* Le bloc ne montre que des affiches : on ne lui envoie PAS les séances.
     Pau (7 salles, 06/11/2026) en a ~1 400 sur l'horizon — 400 Ko pour un
     carrousel, et PostgREST plafonne à 1 000 lignes par requête : la fin
     était coupée sans erreur. On lit donc par pages, trois colonnes seulement,
     et on ne renvoie que la liste des films, triée par prochaine séance. */
  const lignes: Pick<Seance, 'etablissement_id' | 'film_id' | 'date'>[] = []
  for (let de = 0; ; de += PAGE) {
    const { data } = await supabaseAdmin
      .from('seances')
      .select('etablissement_id, film_id, date')
      .in('etablissement_id', cinemas.map(c => c.id))
      .gte('date', aujourdhui)
      .lte('date', dateParis(JOURS_AFFICHES))
      .order('date')
      .order('heure')
      .order('id')
      .range(de, de + PAGE - 1)
    lignes.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }

  const ordre = Array.from(new Set(lignes.map(s => s.film_id)))
  const seancesAujourdhui = lignes.filter(s => s.date === aujourdhui).length

  // Deux requêtes plutôt qu'une jointure : les jointures implicites PostgREST
  // échouent silencieusement sur ce projet (piège documenté).
  const { data: filmsRows } = ordre.length
    ? await supabaseAdmin.from('films').select('id, titre, affiche_url').in('id', ordre)
    : { data: [] }
  const parId = new Map((filmsRows ?? []).map(f => [f.id, f as FilmAffiche]))

  // Les salles qui ont quelque chose à l'affiche : c'est vers elles que mène
  // le bloc. Une salle avec le module mais sans programmation n'y est pour rien.
  const actives = new Set(lignes.map(s => s.etablissement_id))

  return NextResponse.json({
    villageVisibilite,
    aujourdhui,
    cinemas: cinemas.filter(c => actives.has(c.id)).map(c => ({ id: c.id, slug: c.slug })),
    films: ordre.map(id => parId.get(id)).filter(Boolean),
    seancesAujourdhui,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
