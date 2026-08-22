import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/server-auth'
import { peutAdministrerCinema, listerCinemas, resoudreFilm } from '@/lib/cinema-server'
import { rechercherFilms, detailsFilm, tmdbConfigure } from '@/lib/tmdb'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Passerelle TMDB — SERVEUR UNIQUEMENT.
 *
 *   GET  ?q=dune           → résultats de recherche (liste allégée)
 *   GET  ?tmdb=438631      → fiche détaillée, pour l'aperçu avant création
 *   POST { cinema, tmdbId} → crée ou réutilise NOTRE film, et le renvoie
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

    const q = searchParams.get('q') ?? ''
    return NextResponse.json({ resultats: await rechercherFilms(q) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    // TMDB injoignable ou trop lent : on le dit, et l'écran bascule sur la
    // saisie manuelle. Jamais de blocage.
    console.error('[tmdb]', (e as Error).message)
    return NextResponse.json({ error: 'Recherche indisponible', indisponible: true }, { status: 503 })
  }
}

/** Crée (ou réutilise) notre fiche film à partir d'un identifiant TMDB. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const cinemaId: string | null = body?.cinema ?? null
  const g = await garde(req, cinemaId)
  if (g.erreur) return g.erreur
  if (!cinemaId) return NextResponse.json({ error: 'cinema manquant' }, { status: 400 })
  if (!tmdbConfigure()) return pasDeCle()

  const id = Number(body?.tmdbId)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 })
  }

  try {
    const { film, reutilise } = await resoudreFilm(id, cinemaId)
    return NextResponse.json({ film, reutilise })
  } catch (e) {
    console.error('[tmdb:create]', (e as Error).message)
    return NextResponse.json({ error: 'Création impossible' }, { status: 500 })
  }
}
