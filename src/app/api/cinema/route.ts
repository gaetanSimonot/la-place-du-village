import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { dateParis, type Film, type Seance } from '@/lib/cinema'
import { listerCinemas } from '@/lib/cinema-server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/cinema — tout ce qu'il faut à l'expérience publique.
 *
 * Sans compte, sans condition. Un seul appel plutôt qu'une cascade : la page
 * a besoin des films à l'affiche, des séances du jour, de la semaine et de ce
 * qui arrive — les découper ferait quatre allers-retours pour un volume qui
 * tient dans une réponse (un cinéma ≈ 40 séances par semaine).
 *
 * Query : ?cinema=<slug|id> pour ouvrir directement une salle (QR code).
 *
 * Pas de cache CDN : une séance ajoutée doit se voir tout de suite, et le
 * volume ne justifie pas d'en discuter.
 */

/** Horizon de programmation exposé publiquement. */
const JOURS_AFFICHES = 21

export async function GET(req: NextRequest) {
  const demande = new URL(req.url).searchParams.get('cinema')

  const cinemas = await listerCinemas()
  if (!cinemas.length) {
    return NextResponse.json({ cinemas: [], cinema: null, films: [], seances: [], evenements: [] })
  }

  // ?cinema= accepte le slug (lisible, pour les QR) ou l'id.
  const cinema = demande
    ? cinemas.find(c => c.slug === demande || c.id === demande) ?? cinemas[0]
    : cinemas[0]

  const aujourdhui = dateParis()
  const fin = dateParis(JOURS_AFFICHES)

  const { data: seancesRows } = await supabaseAdmin
    .from('seances')
    .select('id, etablissement_id, film_id, date, heure, version, salle, billetterie_url, note')
    .eq('etablissement_id', cinema.id)
    .gte('date', aujourdhui)
    .lte('date', fin)
    .order('date')
    .order('heure')
  const seances = (seancesRows ?? []) as Seance[]

  // Deux requêtes plutôt qu'une jointure : les jointures implicites PostgREST
  // échouent silencieusement sur ce projet (piège documenté).
  const filmIds = Array.from(new Set(seances.map(s => s.film_id)))
  const { data: filmsRows } = filmIds.length
    ? await supabaseAdmin.from('films').select('*').in('id', filmIds)
    : { data: [] }
  const films = (filmsRows ?? []) as Film[]

  // Les séances spéciales (avant-première, ciné-débat) restent des événements
  // du village : on les rappelle ici, elles ne vivent pas dans `seances`.
  const { data: evenements } = await supabaseAdmin
    .from('evenements')
    .select('id, titre, date_debut, heure, image_url, categorie, film_id')
    .eq('etablissement_id', cinema.id)
    .eq('statut', 'publie')
    .gte('date_debut', aujourdhui)
    .order('date_debut')
    .limit(20)

  return NextResponse.json({
    cinemas: cinemas.map(c => ({ id: c.id, nom: c.nom, commune: c.commune, slug: c.slug })),
    cinema,
    films,
    seances,
    evenements: evenements ?? [],
    aujourdhui,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
