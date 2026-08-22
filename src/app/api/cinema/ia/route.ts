import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'
import { rateLimit } from '@/lib/rateLimit'
import { validateImageUpload } from '@/lib/imageUpload'
import { peutAdministrerCinema } from '@/lib/cinema-server'
import { trouverFilms, lireProgramme, type FilmCatalogue } from '@/lib/cinema-ia'
import { tmdbConfigure } from '@/lib/tmdb'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Une photo de programme peut porter quarante séances : Claude lit l'image,
// puis on normalise. Comptez une vingtaine de secondes, on donne de la marge.
export const maxDuration = 60

/**
 * Saisie parlée du module cinéma — dictée, texte libre, ou photo de programme.
 *
 *   POST { cinema, mode: 'films',     texte }
 *        → { groupes: [{ libelle, precis, films[] }] }   propositions à cocher
 *
 *   POST { cinema, mode: 'programme', texte?, image? }
 *        → { seances: [...], catalogue: [...] }          séances à valider
 *
 * Rien n'est écrit ici : cette route PROPOSE. La création passe ensuite par
 * /api/cinema/tmdb (films, donc resoudreFilm) et /api/cinema/admin (séances),
 * qui gardent leur propre garde. C'est ce qui évite un second chemin d'écriture
 * dans le module.
 *
 * Garde : les trois conditions du module cinéma, plus le rate-limit `ai_extract`
 * partagé avec l'extraction d'événements — même ressource, mêmes plafonds.
 */

export async function POST(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const body = await req.json().catch(() => ({}))
  const cinemaId: string | null = typeof body?.cinema === 'string' ? body.cinema : null
  if (!cinemaId) return NextResponse.json({ error: 'cinema manquant' }, { status: 400 })

  if (!(await peutAdministrerCinema(cinemaId, ctx.userId, ctx.isAdmin))) {
    return NextResponse.json({ error: 'Module cinéma non accordé' }, { status: 403 })
  }

  const blocked = await rateLimit(ctx.userId, 'ai_extract', ctx.plan, ctx.isAdmin)
  if (blocked) return blocked

  const mode = body?.mode === 'programme' ? 'programme' : 'films'
  const texte = typeof body?.texte === 'string' ? body.texte.trim().slice(0, 4000) : ''

  // L'image n'est jamais stockée — elle part chez Claude et s'arrête là. On la
  // valide quand même (MIME, magic bytes, 5 Mo) : c'est une entrée publique.
  let image: string | undefined
  let imageMime: string | undefined
  if (typeof body?.image === 'string' && body.image) {
    const v = validateImageUpload(body.image, body?.imageMimeType || 'image/jpeg')
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status })
    image = body.image
    imageMime = v.mimeType
  }

  if (!texte && !image) {
    return NextResponse.json({ error: 'Dictez ou écrivez quelque chose.' }, { status: 400 })
  }

  try {
    if (mode === 'films') {
      if (!tmdbConfigure()) {
        return NextResponse.json({ error: 'Recherche indisponible', indisponible: true }, { status: 503 })
      }
      const groupes = await trouverFilms(texte)
      return NextResponse.json({ groupes }, { headers: { 'Cache-Control': 'no-store' } })
    }

    // Le catalogue part dans le prompt : c'est lui qui permet à « le Gondry »
    // de tomber sur le bon film sans repasser par TMDB.
    const catalogue = await catalogueDuCinema(cinemaId)
    const { seances, ignorees } = await lireProgramme(texte || null, catalogue, image, imageMime)
    return NextResponse.json({ seances, catalogue, ignorees }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[cinema:ia]', (e as Error).message)
    return NextResponse.json({ error: 'Lecture impossible. Réessayez ou saisissez à la main.' }, { status: 502 })
  }
}

/**
 * Les films que ce cinéma peut programmer : ceux qu'il a saisis, plus ceux
 * qu'il joue déjà (un film créé par une autre salle et repris ici).
 */
async function catalogueDuCinema(cinemaId: string): Promise<FilmCatalogue[]> {
  const { data: seances } = await supabaseAdmin
    .from('seances').select('film_id').eq('etablissement_id', cinemaId)
  const joues = Array.from(new Set((seances ?? []).map(s => s.film_id)))

  const { data } = await supabaseAdmin
    .from('films')
    .select('id, titre, annee, realisateur')
    .or(`cree_par.eq.${cinemaId}${joues.length ? `,id.in.(${joues.join(',')})` : ''}`)
    .order('titre')
    .limit(200)

  return (data ?? []) as FilmCatalogue[]
}
