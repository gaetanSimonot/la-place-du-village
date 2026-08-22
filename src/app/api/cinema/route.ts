import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { dateParis, parseVisibilite, type Film, type Seance } from '@/lib/cinema'
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
 * Sans paramètre, TOUTES les salles sont agrégées — comme le bloc du Village.
 *
 * Pas de cache CDN : une séance ajoutée doit se voir tout de suite, et le
 * volume ne justifie pas d'en discuter.
 */

/** Horizon de programmation exposé publiquement. */
const JOURS_AFFICHES = 21

export async function GET(req: NextRequest) {
  const demande = new URL(req.url).searchParams.get('cinema')

  // Le bloc du Village est-il ouvert à tout le monde, ou réservé aux admins
  // le temps du rodage ? Réglage unique, piloté depuis l'admin.
  const { data: cfg } = await supabaseAdmin
    .from('config').select('value').eq('key', 'cinema_village_public').maybeSingle()
  const villageVisibilite = parseVisibilite(cfg?.value)

  const cinemas = await listerCinemas()
  if (!cinemas.length) {
    return NextResponse.json({ cinemas: [], cinema: null, films: [], seances: [], evenements: [], villageVisibilite })
  }

  const aujourdhui = dateParis()
  const fin = dateParis(JOURS_AFFICHES)

  // ?cinema= accepte le slug (lisible, pour les QR) ou l'id, et ouvre CETTE
  // salle. Sans paramètre, on n'en choisit AUCUNE : on les agrège toutes.
  // Prendre la première jouait un tour dès la deuxième salle — un film entré
  // au Vigan remontait sur le Village (qui agrège) mais restait introuvable
  // ici, ni à l'affiche ni au programme.
  const cinema = demande
    ? cinemas.find(c => c.slug === demande || c.id === demande) ?? null
    : null
  const salles = cinema ? [cinema] : cinemas
  const sallesIds = salles.map(c => c.id)

  const { data: seancesRows } = await supabaseAdmin
    .from('seances')
    .select('id, etablissement_id, film_id, date, heure, version, salle, billetterie_url, note')
    .in('etablissement_id', sallesIds)
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
    .select('id, titre, date_debut, heure, image_url, categorie, categorie_libre, film_id, lieu_id')
    .in('etablissement_id', sallesIds)
    .eq('statut', 'publie')
    .gte('date_debut', aujourdhui)
    .order('date_debut')
    .limit(20)

  // Où ça se passe. Presque toujours le cinéma lui-même, mais pas toujours —
  // un ciné plein air se joue sur la place. Deuxième requête plutôt qu'une
  // jointure, même raison que pour les films.
  const lieuIds = Array.from(new Set((evenements ?? []).map(e => e.lieu_id).filter(Boolean))) as string[]
  const { data: lieuxRows } = lieuIds.length
    ? await supabaseAdmin.from('lieux').select('id, nom, adresse, commune').in('id', lieuIds)
    : { data: [] }
  const parLieu = new Map((lieuxRows ?? []).map(l => [l.id, l]))

  return NextResponse.json({
    cinemas,
    // `null` = on regarde toutes les salles à la fois. Une salle précise n'est
    // retenue que si elle a été demandée.
    cinema,
    films,
    seances,
    evenements: (evenements ?? []).map(e => ({ ...e, lieu: e.lieu_id ? parLieu.get(e.lieu_id) ?? null : null })),
    aujourdhui,
    villageVisibilite,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
