import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// Convertit les chaînes vides en null pour les champs date/heure
function nullIfEmpty(v: unknown) {
  return v === '' ? null : v
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()

    // Mise à jour du lieu si lat/lng fournis
    if (body.lieu_id && (body.lat !== undefined || body.lng !== undefined)) {
      const lieuUpdate: Record<string, unknown> = {}
      if (body.lat !== undefined) lieuUpdate.lat = body.lat
      if (body.lng !== undefined) lieuUpdate.lng = body.lng
      if (body.lieu_nom !== undefined) lieuUpdate.nom = body.lieu_nom
      if (body.adresse !== undefined) lieuUpdate.adresse = body.adresse
      if (body.commune !== undefined) lieuUpdate.commune = body.commune
      if (body.place_id_google !== undefined) lieuUpdate.place_id_google = body.place_id_google

      const { error: lieuErr } = await supabaseAdmin
        .from('lieux')
        .update(lieuUpdate)
        .eq('id', body.lieu_id)

      if (lieuErr) throw new Error(`Erreur mise à jour lieu : ${lieuErr.message}`)
    }

    // Mise à jour de l'événement
    const eventUpdate: Record<string, unknown> = {}
    const textFields = ['titre', 'description', 'categorie', 'statut', 'prix', 'contact', 'organisateurs', 'image_url', 'image_position', 'promotion']
    const dateFields = ['date_debut', 'date_fin', 'heure']
    textFields.forEach(f => { if (body[f] !== undefined) eventUpdate[f] = body[f] })
    dateFields.forEach(f => { if (body[f] !== undefined) eventUpdate[f] = nullIfEmpty(body[f]) })
    if (body.promo_ordre !== undefined) eventUpdate.promo_ordre = body.promo_ordre

    const { data, error } = await supabaseAdmin
      .from('evenements')
      .update(eventUpdate)
      .eq('id', params.id)
      .select('*, lieux(*)')
      .single()

    if (error) throw new Error(`Erreur mise à jour : ${error.message}`)

    return NextResponse.json({ success: true, evenement: data })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur inconnue' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Récupère le lieu_id avant suppression
    const { data: evt } = await supabaseAdmin
      .from('evenements')
      .select('lieu_id')
      .eq('id', params.id)
      .single()

    const { error } = await supabaseAdmin.from('evenements').delete().eq('id', params.id)
    if (error) throw new Error(error.message)

    // Supprime le lieu s'il n'est plus utilisé
    if (evt?.lieu_id) {
      const { count } = await supabaseAdmin
        .from('evenements')
        .select('id', { count: 'exact', head: true })
        .eq('lieu_id', evt.lieu_id)

      if (count === 0) {
        await supabaseAdmin.from('lieux').delete().eq('id', evt.lieu_id)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur inconnue' }, { status: 500 })
  }
}
