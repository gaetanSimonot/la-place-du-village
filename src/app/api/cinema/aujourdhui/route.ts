import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { dateParis, parseVisibilite, type Film, type Seance } from '@/lib/cinema'
import { listerCinemas } from '@/lib/cinema-server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/cinema/aujourdhui — les séances du jour, TOUTES SALLES CONFONDUES.
 *
 * Le bloc du Village s'appuyait au départ sur /api/cinema, qui répond pour UNE
 * salle et retenait la première par ordre alphabétique. Dès qu'une deuxième
 * fiche a reçu le module, le bloc s'est mis à interroger une salle sans
 * programmation et disparaissait — alors qu'un cinéma jouait le soir même.
 *
 * L'accueil ne montre pas « un » cinéma, il montre ce qui passe au cinéma
 * aujourd'hui. D'où cette route dédiée.
 */
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
    .eq('date', aujourdhui)
    .order('heure')
  const seances = (seancesRows ?? []) as Seance[]

  const filmIds = Array.from(new Set(seances.map(s => s.film_id)))
  const { data: filmsRows } = filmIds.length
    ? await supabaseAdmin.from('films').select('*').in('id', filmIds)
    : { data: [] }

  // Les salles qui jouent aujourd'hui : c'est vers elles que mène le bloc.
  const actives = new Set(seances.map(s => s.etablissement_id))

  return NextResponse.json({
    villageVisibilite,
    aujourdhui,
    cinemas: cinemas.filter(c => actives.has(c.id)),
    films: (filmsRows ?? []) as Film[],
    seances,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
