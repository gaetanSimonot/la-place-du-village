import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'
import { dateParis, type VersionFilm } from '@/lib/cinema'
import { peutAdministrerCinema, sallesAdministrables, lierFilmAuCinema, filmsDuCinema } from '@/lib/cinema-server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Administration d'un cinéma — films et séances.
 *
 * Toutes les routes vérifient les trois conditions CÔTÉ SERVEUR via
 * peutAdministrerCinema() : masquer un écran ne protège rien.
 *
 *  GET    ?cinema=<id>            → films du cinéma + séances à venir
 *  POST   { cinema, film }        → crée ou réutilise un film
 *  POST   { cinema, seances[] }   → crée des séances (import ou saisie)
 *  PATCH  { cinema, film }        → met à jour une fiche film
 *  DELETE ?seance=<id>            → supprime une séance
 *  DELETE ?film=<id>&cinema=<id>  → retire un film d'une salle (et ses séances)
 */

/** Fenêtre de programmation présentée à l'exploitant. */
const HORIZON_JOURS = 60

async function garde(req: NextRequest, cinemaId: string | null) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return { erreur: ctx }
  if (!cinemaId) {
    return { erreur: NextResponse.json({ error: 'cinema manquant' }, { status: 400 }) }
  }
  const ok = await peutAdministrerCinema(cinemaId, ctx.userId, ctx.isAdmin)
  if (!ok) {
    return { erreur: NextResponse.json({ error: 'Module cinéma non accordé' }, { status: 403 }) }
  }
  return { ctx }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  // Toutes les salles administrables, pas seulement celle qu'on ouvre : le
  // client en fait un sélecteur dès qu'il y en a deux. Sans paramètre, on
  // ouvre la première — un paramètre non autorisé est refusé par la garde,
  // jamais rabattu en silence sur une autre salle.
  const salles = await sallesAdministrables(ctx.userId, ctx.isAdmin)
  const cinemaId = searchParams.get('cinema') ?? salles[0]?.id ?? null
  if (!cinemaId) {
    return NextResponse.json({ cinema: null, salles: [], films: [], seances: [] })
  }

  const g = await garde(req, cinemaId)
  if (g.erreur) return g.erreur

  const [cinemaRes, seancesRes] = await Promise.all([
    supabaseAdmin.from('etablissements')
      .select('id, nom, commune, slug, billetterie_url').eq('id', cinemaId).maybeSingle(),
    supabaseAdmin.from('seances')
      .select('id, film_id, date, heure, version, salle, note')
      .eq('etablissement_id', cinemaId)
      .gte('date', dateParis(-1))
      .lte('date', dateParis(HORIZON_JOURS))
      .order('date').order('heure'),
  ])

  const seances = seancesRes.data ?? []
  // Le catalogue de CETTE salle, même sans séance à venir : elle doit pouvoir
  // reprogrammer un film sans le ressaisir. Un film créé par une autre salle
  // et repris ici en fait partie — c'est tout l'objet de `cinema_films`.
  const catalogue = await filmsDuCinema(cinemaId)
  const { data: films } = catalogue.length
    ? await supabaseAdmin.from('films').select('*').in('id', catalogue).order('titre')
    : { data: [] }

  return NextResponse.json({
    cinema: cinemaRes.data ?? null,
    salles,
    films: films ?? [],
    seances,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const cinemaId: string | null = body?.cinema ?? null
  const g = await garde(req, cinemaId)
  if (g.erreur) return g.erreur

  // ── Créer un film ────────────────────────────────────────────────────
  if (body.film) {
    const f = body.film
    const titre = String(f.titre ?? '').trim()
    if (!titre) return NextResponse.json({ error: 'Titre manquant' }, { status: 400 })

    // Un même film ne doit pas être recréé à chaque séance : on réutilise
    // celui qui porte déjà ce titre (comparaison insensible à la casse).
    const { data: existant } = await supabaseAdmin
      .from('films').select('*').ilike('titre', titre).maybeSingle()
    if (existant) {
      // Réutiliser la fiche d'une autre salle ne suffit pas : sans ce lien,
      // « il existe déjà » et le film n'apparaît nulle part ici.
      await lierFilmAuCinema(existant.id, cinemaId!)
      return NextResponse.json({ film: existant, reutilise: true })
    }

    const { data, error } = await supabaseAdmin.from('films').insert({
      titre,
      titre_original: f.titre_original || null,
      annee:       Number.isFinite(Number(f.annee)) ? Number(f.annee) : null,
      duree_min:   Number.isFinite(Number(f.duree_min)) ? Number(f.duree_min) : null,
      realisateur: f.realisateur || null,
      casting:     f.casting || null,
      genres:      Array.isArray(f.genres) ? f.genres : null,
      synopsis:    f.synopsis || null,
      affiche_url: f.affiche_url || null,
      bande_annonce_url: f.bande_annonce_url || null,
      avertissement: f.avertissement || null,
      cree_par:    cinemaId,
    }).select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await lierFilmAuCinema(data.id, cinemaId!)
    return NextResponse.json({ film: data, reutilise: false })
  }

  // ── Créer des séances ────────────────────────────────────────────────
  if (Array.isArray(body.seances)) {
    const VERSIONS_OK: VersionFilm[] = ['vf', 'vost', 'vo']
    const lignes = body.seances
      .filter((s: { film_id?: string; date?: string; heure?: string }) => s?.film_id && s?.date && s?.heure)
      .map((s: { film_id: string; date: string; heure: string; version?: string; salle?: string; note?: string }) => ({
        etablissement_id: cinemaId,
        film_id: s.film_id,
        date:    s.date,
        // « 20:30 » comme « 20:30:00 » sont acceptés en entrée.
        heure:   s.heure.length === 5 ? `${s.heure}:00` : s.heure,
        version: VERSIONS_OK.includes(s.version as VersionFilm) ? s.version : 'vf',
        salle:   s.salle || null,
        note:    s.note || null,
      }))
    if (!lignes.length) return NextResponse.json({ error: 'Aucune séance exploitable' }, { status: 400 })

    // ignoreDuplicates : réimporter le même programme ne crée pas de doublon,
    // c'est la contrainte unique de la table qui tranche.
    const { data, error } = await supabaseAdmin
      .from('seances').upsert(lignes, {
        onConflict: 'etablissement_id,film_id,date,heure',
        ignoreDuplicates: true,
      }).select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Programmer un film, c'est l'avoir : la dictée peut créer des séances
    // sur un film repris d'une autre salle sans passer par « Ajouter ».
    const vus = Array.from(new Set(lignes.map((l: { film_id: string }) => l.film_id))) as string[]
    await Promise.all(vus.map(id => lierFilmAuCinema(id, cinemaId!)))

    return NextResponse.json({ crees: data?.length ?? 0, recus: lignes.length })
  }

  return NextResponse.json({ error: 'Rien à enregistrer' }, { status: 400 })
}

/** Met à jour une fiche film (affiche, synopsis, distribution…). */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const g = await garde(req, body?.cinema ?? null)
  if (g.erreur) return g.erreur

  const f = body?.film
  if (!f?.id) return NextResponse.json({ error: 'film.id manquant' }, { status: 400 })

  // Liste blanche : on n'écrit que les champs éditables. `cree_par` et les
  // dates ne doivent jamais venir du client.
  const maj: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof f.titre === 'string' && f.titre.trim()) maj.titre = f.titre.trim()
  for (const champ of ['titre_original', 'realisateur', 'casting', 'synopsis', 'affiche_url', 'bande_annonce_url', 'avertissement'] as const) {
    if (champ in f) maj[champ] = f[champ] || null
  }
  for (const champ of ['annee', 'duree_min'] as const) {
    if (champ in f) maj[champ] = Number.isFinite(Number(f[champ])) && f[champ] !== '' ? Number(f[champ]) : null
  }
  if ('genres' in f) {
    maj.genres = Array.isArray(f.genres)
      ? f.genres
      : String(f.genres || '').split(',').map((x: string) => x.trim()).filter(Boolean)
    if (!(maj.genres as string[]).length) maj.genres = null
  }

  const { data, error } = await supabaseAdmin
    .from('films').update(maj).eq('id', f.id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ film: data })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const filmId = searchParams.get('film')

  if (filmId) {
    const { data: film } = await supabaseAdmin
      .from('films').select('cree_par').eq('id', filmId).maybeSingle()
    if (!film) return NextResponse.json({ error: 'Film introuvable' }, { status: 404 })

    // La salle qui agit. Le client l'envoie ; à défaut on retombe sur celle
    // qui a créé la fiche, puis sur celle qui la programme — sans ça, avec
    // deux salles, on gardait la mauvaise et l'admin supprimait chez l'autre.
    let cinemaId = searchParams.get('cinema')
    if (!cinemaId) {
      const { data: ailleurs } = await supabaseAdmin
        .from('seances').select('etablissement_id').eq('film_id', filmId).limit(1)
      cinemaId = film.cree_par ?? ailleurs?.[0]?.etablissement_id ?? null
    }
    const g = await garde(req, cinemaId)
    if (g.erreur) return g.erreur

    // On retire le film DE CETTE SALLE : son entrée au catalogue et ses
    // séances à elle. Les films sont globaux — effacer la fiche emporterait
    // par cascade la programmation du confrère.
    await supabaseAdmin.from('cinema_films')
      .delete().eq('etablissement_id', cinemaId).eq('film_id', filmId)
    await supabaseAdmin.from('seances')
      .delete().eq('etablissement_id', cinemaId).eq('film_id', filmId)

    // Plus personne ne le revendique : la fiche part avec.
    const [liens, seancesAilleurs] = await Promise.all([
      supabaseAdmin.from('cinema_films').select('etablissement_id').eq('film_id', filmId).limit(1),
      supabaseAdmin.from('seances').select('id').eq('film_id', filmId).limit(1),
    ])
    const vitAilleurs = Boolean(liens.data?.length || seancesAilleurs.data?.length)
    if (!vitAilleurs) {
      const { error } = await supabaseAdmin.from('films').delete().eq('id', filmId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, conserve: vitAilleurs })
  }

  const seanceId = searchParams.get('seance')
  if (!seanceId) return NextResponse.json({ error: 'seance ou film manquant' }, { status: 400 })

  // On remonte à la salle depuis la séance : la garde porte sur le cinéma,
  // pas sur la ligne, sinon n'importe qui pourrait supprimer chez le voisin.
  const { data: seance } = await supabaseAdmin
    .from('seances').select('etablissement_id').eq('id', seanceId).maybeSingle()
  if (!seance) return NextResponse.json({ error: 'Séance introuvable' }, { status: 404 })

  const g = await garde(req, seance.etablissement_id)
  if (g.erreur) return g.erreur

  const { error } = await supabaseAdmin.from('seances').delete().eq('id', seanceId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
