import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'
import { dateParis, type VersionFilm } from '@/lib/cinema'
import { peutAdministrerCinema, listerCinemas } from '@/lib/cinema-server'

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
 *  DELETE ?seance=<id>            → supprime une séance
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
  let cinemaId = searchParams.get('cinema')

  // Sans paramètre : la première salle que cette personne peut administrer.
  if (!cinemaId) {
    const ctx = await requireUser(req)
    if (ctx instanceof Response) return ctx
    const cinemas = await listerCinemas()
    for (const c of cinemas) {
      if (await peutAdministrerCinema(c.id, ctx.userId, ctx.isAdmin)) { cinemaId = c.id; break }
    }
    if (!cinemaId) return NextResponse.json({ cinema: null, films: [], seances: [] })
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
  const filmIds = Array.from(new Set(seances.map(s => s.film_id)))
  // Les films déjà saisis par ce cinéma, même sans séance à venir : il doit
  // pouvoir reprogrammer un film sans le ressaisir.
  const { data: films } = await supabaseAdmin
    .from('films').select('*')
    .or(`cree_par.eq.${cinemaId}${filmIds.length ? `,id.in.(${filmIds.join(',')})` : ''}`)
    .order('titre')

  return NextResponse.json({
    cinema: cinemaRes.data ?? null,
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
    if (existant) return NextResponse.json({ film: existant, reutilise: true })

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
    return NextResponse.json({ crees: data?.length ?? 0, recus: lignes.length })
  }

  return NextResponse.json({ error: 'Rien à enregistrer' }, { status: 400 })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const seanceId = searchParams.get('seance')
  if (!seanceId) return NextResponse.json({ error: 'seance manquante' }, { status: 400 })

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
