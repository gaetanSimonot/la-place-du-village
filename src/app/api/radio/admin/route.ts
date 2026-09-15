import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/server-auth'
import { RADIO, audioUrlValide, semaineDe } from '@/lib/radio'

/**
 * /api/radio/admin — la saisie d'une émission et de ce qu'elle cite.
 *
 * Contrat :
 *   GET    ?                      → { emissions } — la liste, récente d'abord
 *   GET    ?emission=<id>         → { emission, mentions }
 *   GET    ?recherche=<texte>     → { resultats } — chercher une fiche à rattacher
 *   POST   { type:'emission', … } → crée l'émission de la semaine
 *   POST   { type:'mention',  … } → ajoute une ligne à une émission
 *   PATCH  { type, id, … }        → modifie l'un ou l'autre
 *   DELETE ?emission=<id> | ?mention=<id>
 *
 * RÉSERVÉ AUX ADMINS, et vérifié ici. Contrairement au cinéma, la radio n'est
 * pas une fiche établissement qu'un partenaire administre : c'est un contenu
 * qu'on monte nous-mêmes. Le jour où Radio Escapades saisit elle-même, ce sera
 * une fiche revendiquée et une garde composée, comme `peutAdministrerCinema`.
 *
 * L'écran ne protège rien : c'est cette route qui décide.
 */

export const revalidate = 0
export const fetchCache = 'force-no-store'

const CHAMPS_EMISSION = 'id, radio, titre, description, audio_url, duree_s, image_url, semaine_debut, statut, created_at'

/** Le lundi d'une date quelconque — la saisie accepte n'importe quel jour. */
function lundiDe(ymd: string): string {
  return semaineDe(new Date(`${ymd}T12:00:00Z`)).debut
}

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const p = new URL(req.url).searchParams
  const emissionId = p.get('emission')
  const recherche = (p.get('recherche') ?? '').trim()

  // Chercher une fiche à rattacher. Le titre suffit : on cherche un événement
  // qu'on vient d'entendre nommer, pas à explorer l'agenda.
  if (recherche) {
    if (recherche.length < 3) return NextResponse.json({ resultats: [] })
    const { data } = await supabaseAdmin
      .from('evenements')
      .select('id, titre, date_debut, heure, categorie, lieux(nom, commune)')
      .eq('statut', 'publie')
      .ilike('titre', `%${recherche.replace(/[%_]/g, m => '\\' + m)}%`)
      .order('date_debut', { ascending: true })
      .limit(15)
    return NextResponse.json({ resultats: data ?? [] })
  }

  if (emissionId) {
    const { data: emission } = await supabaseAdmin
      .from('radio_emissions').select(CHAMPS_EMISSION).eq('id', emissionId).maybeSingle()
    if (!emission) return NextResponse.json({ error: 'Émission introuvable' }, { status: 404 })

    const { data: mentions } = await supabaseAdmin
      .from('radio_mentions')
      .select('id, titre, detail, ordre, evenement_id, evenements(id, titre, date_debut, heure, categorie, lieux(nom, commune))')
      .eq('emission_id', emissionId)
      .order('ordre', { ascending: true })

    return NextResponse.json({ emission, mentions: mentions ?? [] })
  }

  const { data: emissions } = await supabaseAdmin
    .from('radio_emissions').select(CHAMPS_EMISSION)
    .eq('radio', RADIO.cle)
    .order('semaine_debut', { ascending: false })
    .limit(60)
  return NextResponse.json({ emissions: emissions ?? [] })
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Corps illisible' }, { status: 400 })

  if (body.type === 'emission') {
    const titre = String(body.titre ?? '').trim()
    const audio = String(body.audio_url ?? '').trim()
    const semaine = String(body.semaine_debut ?? '').trim()

    if (!titre) return NextResponse.json({ error: 'Le titre est requis' }, { status: 400 })
    if (!audioUrlValide(audio)) return NextResponse.json({ error: "Le lien audio n'est pas une URL valide" }, { status: 400 })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(semaine)) return NextResponse.json({ error: 'Semaine invalide' }, { status: 400 })

    const { data, error } = await supabaseAdmin.from('radio_emissions').insert({
      radio: RADIO.cle,
      titre,
      description: String(body.description ?? '').trim() || null,
      audio_url: audio,
      duree_s: Number.isFinite(+body.duree_s) && +body.duree_s > 0 ? Math.round(+body.duree_s) : null,
      image_url: String(body.image_url ?? '').trim() || null,
      // Toujours ramené au lundi : c'est la clé d'unicité, et une saisie faite
      // un mercredi créerait sinon une deuxième émission pour la même semaine.
      semaine_debut: lundiDe(semaine),
      statut: body.statut === 'publie' ? 'publie' : 'brouillon',
    }).select(CHAMPS_EMISSION).single()

    if (error) {
      // 23505 = l'index unique (radio, semaine_debut). Le dire en clair plutôt
      // que de rendre une erreur Postgres à l'écran.
      const dejaLa = error.code === '23505'
      return NextResponse.json(
        { error: dejaLa ? 'Une émission existe déjà pour cette semaine' : error.message },
        { status: dejaLa ? 409 : 500 },
      )
    }
    return NextResponse.json({ emission: data })
  }

  if (body.type === 'mention') {
    const emissionId = String(body.emission_id ?? '')
    const titre = String(body.titre ?? '').trim()
    if (!emissionId) return NextResponse.json({ error: 'Émission manquante' }, { status: 400 })
    if (!titre) return NextResponse.json({ error: 'Le titre est requis' }, { status: 400 })

    // L'ordre suit la saisie : on ajoute à la fin, sans demander à l'écran de
    // tenir un compteur qui se désynchroniserait à la première suppression.
    const { data: dernier } = await supabaseAdmin
      .from('radio_mentions').select('ordre')
      .eq('emission_id', emissionId).order('ordre', { ascending: false }).limit(1)
    const ordre = ((dernier ?? [])[0]?.ordre ?? -1) + 1

    const { data, error } = await supabaseAdmin.from('radio_mentions').insert({
      emission_id: emissionId,
      evenement_id: body.evenement_id ? String(body.evenement_id) : null,
      titre,
      detail: String(body.detail ?? '').trim() || null,
      ordre,
    }).select('id, titre, detail, ordre, evenement_id').single()

    if (error) {
      const dejaLa = error.code === '23505'
      return NextResponse.json(
        { error: dejaLa ? 'Cet événement est déjà cité par cette émission' : error.message },
        { status: dejaLa ? 409 : 500 },
      )
    }
    return NextResponse.json({ mention: data })
  }

  return NextResponse.json({ error: 'Type inconnu' }, { status: 400 })
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx
  const body = await req.json().catch(() => null)
  if (!body?.id) return NextResponse.json({ error: 'id manquant' }, { status: 400 })

  if (body.type === 'emission') {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (typeof body.titre === 'string' && body.titre.trim()) patch.titre = body.titre.trim()
    if (typeof body.description === 'string') patch.description = body.description.trim() || null
    if (typeof body.image_url === 'string') patch.image_url = body.image_url.trim() || null
    if (typeof body.audio_url === 'string') {
      if (!audioUrlValide(body.audio_url)) return NextResponse.json({ error: "Le lien audio n'est pas une URL valide" }, { status: 400 })
      patch.audio_url = body.audio_url.trim()
    }
    if (body.duree_s !== undefined) patch.duree_s = Number.isFinite(+body.duree_s) && +body.duree_s > 0 ? Math.round(+body.duree_s) : null
    if (['brouillon', 'publie', 'archive'].includes(body.statut)) patch.statut = body.statut

    const { data, error } = await supabaseAdmin
      .from('radio_emissions').update(patch).eq('id', body.id).select(CHAMPS_EMISSION).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ emission: data })
  }

  if (body.type === 'mention') {
    const patch: Record<string, unknown> = {}
    if (typeof body.titre === 'string' && body.titre.trim()) patch.titre = body.titre.trim()
    if (typeof body.detail === 'string') patch.detail = body.detail.trim() || null
    if (body.evenement_id !== undefined) patch.evenement_id = body.evenement_id ? String(body.evenement_id) : null
    if (Number.isFinite(+body.ordre)) patch.ordre = Math.round(+body.ordre)

    const { data, error } = await supabaseAdmin
      .from('radio_mentions').update(patch).eq('id', body.id).select('id, titre, detail, ordre, evenement_id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ mention: data })
  }

  return NextResponse.json({ error: 'Type inconnu' }, { status: 400 })
}

export async function DELETE(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const p = new URL(req.url).searchParams
  const emissionId = p.get('emission')
  const mentionId = p.get('mention')

  if (mentionId) {
    const { error } = await supabaseAdmin.from('radio_mentions').delete().eq('id', mentionId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }
  if (emissionId) {
    // Les mentions partent en cascade, et le déclencheur retire la mention
    // « Sélection Radio Escapades » des fiches concernées au passage.
    const { error } = await supabaseAdmin.from('radio_emissions').delete().eq('id', emissionId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Rien à supprimer' }, { status: 400 })
}
