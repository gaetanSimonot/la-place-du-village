import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { dateParis, parseVisibilite, type Film, type Seance } from '@/lib/cinema'
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
 * cette semaine. D'où cette route, qui renvoie l'horizon complet et laisse le
 * bloc compter lui-même ce qui passe aujourd'hui.
 */

/** Horizon de programmation, aligné sur celui de l'expérience publique. */
const JOURS_AFFICHES = 21

export async function GET() {
  const { data: cfg } = await supabaseAdmin
    .from('config').select('value').eq('key', 'cinema_village_public').maybeSingle()
  const villageVisibilite = parseVisibilite(cfg?.value)

  const aujourdhui = dateParis()
  const cinemas = await listerCinemas()
  if (!cinemas.length) {
    return NextResponse.json({ villageVisibilite, aujourdhui, cinemas: [], films: [], seances: [] })
  }

  const { data: seancesRows } = await supabaseAdmin
    .from('seances')
    .select('id, etablissement_id, film_id, date, heure, version, salle, billetterie_url, note')
    .in('etablissement_id', cinemas.map(c => c.id))
    .gte('date', aujourdhui)
    .lte('date', dateParis(JOURS_AFFICHES))
    .order('date')
    .order('heure')
  const seances = (seancesRows ?? []) as Seance[]

  // Deux requêtes plutôt qu'une jointure : les jointures implicites PostgREST
  // échouent silencieusement sur ce projet (piège documenté).
  const filmIds = Array.from(new Set(seances.map(s => s.film_id)))
  const { data: filmsRows } = filmIds.length
    ? await supabaseAdmin.from('films').select('*').in('id', filmIds)
    : { data: [] }

  // Les salles qui ont quelque chose à l'affiche : c'est vers elles que mène
  // le bloc. Une salle avec le module mais sans programmation n'y est pour rien.
  const actives = new Set(seances.map(s => s.etablissement_id))

  return NextResponse.json({
    villageVisibilite,
    aujourdhui,
    cinemas: cinemas.filter(c => actives.has(c.id)),
    films: (filmsRows ?? []) as Film[],
    seances,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
