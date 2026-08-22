import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/server-auth'
import { peutAdministrerCinema, listerCinemas, resoudreFilm } from '@/lib/cinema-server'
import {
  rechercherFilms, rechercherPersonnes, filmsDeLaPersonne, detailsFilm, tmdbConfigure,
  type RolePersonne,
} from '@/lib/tmdb'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Passerelle TMDB — SERVEUR UNIQUEMENT.
 *
 *   GET  ?q=dune               → films trouvés + personnes portant ce nom
 *   GET  ?personne=2888&role=… → la filmographie d'une personne
 *   GET  ?tmdb=438631          → fiche détaillée, pour l'aperçu avant création
 *   POST { cinema, tmdbId }    → crée ou réutilise NOTRE film, et le renvoie
 *   POST { cinema, tmdbIds[] } → idem pour une sélection entière
 *
 * Garde : les trois conditions du module cinéma. Sans elle, on offrirait un
 * proxy TMDB gratuit à tout internet. Elle suffit ici — seules deux personnes
 * peuvent atteindre cette route. Le débit est borné côté saisie par un
 * anti-rebond et un minimum de deux caractères ; passer par le rateLimit du
 * projet imposerait d'ajouter une action à un type partagé et une règle en
 * base, disproportionné pour un champ de recherche.
 *
 * On ne renvoie JAMAIS la réponse brute de TMDB : seulement les champs que
 * notre fiche utilise. Exposer leur structure inviterait à s'en servir comme
 * d'une API publique, et ferait fuiter des données qu'on n'a pas à relayer.
 */

async function garde(req: NextRequest, cinemaId: string | null) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return { erreur: ctx }

  // Sans cinéma précisé : toute salle que cette personne peut administrer suffit.
  if (cinemaId) {
    if (!(await peutAdministrerCinema(cinemaId, ctx.userId, ctx.isAdmin))) {
      return { erreur: NextResponse.json({ error: 'Module cinéma non accordé' }, { status: 403 }) }
    }
    return { ctx }
  }
  for (const c of await listerCinemas()) {
    if (await peutAdministrerCinema(c.id, ctx.userId, ctx.isAdmin)) return { ctx }
  }
  return { erreur: NextResponse.json({ error: 'Module cinéma non accordé' }, { status: 403 }) }
}

/** Message unique quand la clé n'est pas configurée — la saisie manuelle reste. */
function pasDeCle() {
  return NextResponse.json(
    { error: 'Recherche indisponible', indisponible: true },
    { status: 503 },
  )
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const g = await garde(req, searchParams.get('cinema'))
  if (g.erreur) return g.erreur

  if (!tmdbConfigure()) return pasDeCle()

  try {
    const tmdb = searchParams.get('tmdb')
    if (tmdb) {
      const id = Number(tmdb)
      if (!Number.isInteger(id) || id <= 0) {
        return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 })
      }
      return NextResponse.json({ film: await detailsFilm(id) }, { headers: { 'Cache-Control': 'no-store' } })
    }

    // Filmographie : « Will Smith » ne veut rien dire pour /search/movie, il
    // faut passer par la personne. C'est ce qui fait que taper un nom d'acteur
    // dans le champ de recherche propose ses films.
    const personne = searchParams.get('personne')
    if (personne) {
      const id = Number(personne)
      if (!Number.isInteger(id) || id <= 0) {
        return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 })
      }
      const role: RolePersonne = searchParams.get('role') === 'realisateur' ? 'realisateur' : 'acteur'
      return NextResponse.json(
        { resultats: await filmsDeLaPersonne(id, role, 20) },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const q = searchParams.get('q') ?? ''
    // Les deux en parallèle : c'est la même frappe, on ne va pas la faire
    // attendre deux allers-retours.
    const [resultats, personnes] = await Promise.all([
      rechercherFilms(q),
      rechercherPersonnes(q).catch(() => []),
    ])
    return NextResponse.json({ resultats, personnes }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    // TMDB injoignable ou trop lent : on le dit, et l'écran bascule sur la
    // saisie manuelle. Jamais de blocage.
    console.error('[tmdb]', (e as Error).message)
    return NextResponse.json({ error: 'Recherche indisponible', indisponible: true }, { status: 503 })
  }
}

/**
 * Crée (ou réutilise) nos fiches films à partir d'identifiants TMDB.
 *
 * `tmdbId` seul pour une création à l'unité, `tmdbIds` pour une sélection
 * entière — les deux passent par resoudreFilm(), le seul endroit du projet où
 * un film se crée. Un identifiant qui échoue n'emporte pas les autres : sur
 * une sélection de douze films, on n'annule pas onze créations valables.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const cinemaId: string | null = body?.cinema ?? null
  const g = await garde(req, cinemaId)
  if (g.erreur) return g.erreur
  if (!cinemaId) return NextResponse.json({ error: 'cinema manquant' }, { status: 400 })
  if (!tmdbConfigure()) return pasDeCle()

  const bruts: unknown[] = Array.isArray(body?.tmdbIds) ? body.tmdbIds : [body?.tmdbId]
  const ids = Array.from(new Set(bruts.map(Number).filter(n => Number.isInteger(n) && n > 0))).slice(0, 30)
  if (!ids.length) {
    return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 })
  }

  const films: unknown[] = []
  let reutilises = 0
  const echecs: number[] = []
  for (const id of ids) {
    try {
      const { film, reutilise } = await resoudreFilm(id, cinemaId)
      films.push(film)
      if (reutilise) reutilises++
    } catch (e) {
      console.error('[tmdb:create]', id, (e as Error).message)
      echecs.push(id)
    }
  }

  if (!films.length) return NextResponse.json({ error: 'Création impossible' }, { status: 500 })

  return NextResponse.json({
    // Rétrocompatible : l'ajout à l'unité lit toujours `film` et `reutilise`.
    film: films[0],
    reutilise: reutilises === films.length,
    films,
    crees: films.length - reutilises,
    reutilises,
    echecs: echecs.length,
  })
}
