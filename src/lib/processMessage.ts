import { createClient } from '@supabase/supabase-js'
import { extractMultipleWithClaude, geocodeWithGoogle, calcStatut } from './extract'
import { checkDoublon } from './checkDoublon'
import { checkZone } from './checkZone'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export interface ProcessResult {
  statut: 'publie' | 'en_attente' | 'non_publiable'
  raison: string
  extraction: object[] | null
  evenements_crees: number
  premier_evenement_id: string | null
}

export async function processMessage(
  messageId: string,
  contenu: string | null,
  imageUrl: string | null,
  source: string = 'whatsapp',
  imageBase64?: string | null,
  imageMime?: string | null,
): Promise<ProcessResult> {
  let base64 = imageBase64 || null
  const mime  = imageMime || 'image/jpeg'

  // Si retraitement sans base64 → fetch depuis URL Supabase
  if (!base64 && imageUrl) {
    try {
      const res = await fetch(imageUrl)
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer())
        base64 = buf.toString('base64')
      }
    } catch { /* continue sans image */ }
  }

  if (!contenu?.trim() && !base64) {
    return { statut: 'non_publiable', raison: 'Aucun contenu à analyser', extraction: null, evenements_crees: 0, premier_evenement_id: null }
  }

  // Extraction Claude
  let events
  try {
    events = await extractMultipleWithClaude(contenu, base64 ?? undefined, mime)
  } catch (e) {
    return {
      statut: 'non_publiable',
      raison: `Extraction échouée : ${e instanceof Error ? e.message : 'erreur Claude'}`,
      extraction: null, evenements_crees: 0, premier_evenement_id: null,
    }
  }

  if (!events.length) {
    return { statut: 'non_publiable', raison: 'Aucun événement détecté par Claude', extraction: [], evenements_crees: 0, premier_evenement_id: null }
  }

  const reasons: string[] = []
  let firstId: string | null = null
  let totalPublie = 0
  let totalAttente = 0

  for (const evt of events) {
    if (!evt.titre?.trim()) { reasons.push('Titre manquant'); continue }

    const check = await checkDoublon({ titre: evt.titre, date_debut: evt.date_debut, commune: evt.commune, lieu_nom: evt.lieu_nom, description: evt.description })
    if (check.doublon) { reasons.push(`"${evt.titre}" → doublon`); continue }

    let lieuId: string | null = null
    let geo = { lat: null as number | null, lng: null as number | null, place_id_google: null as string | null, adresse: null as string | null, approx: false }

    if (evt.lieu_nom || evt.commune) {
      geo = await geocodeWithGoogle(evt.lieu_nom, evt.commune)
      const zone = await checkZone(geo.lat, geo.lng)
      if (!zone.within) { reasons.push(`"${evt.titre}" → hors zone (${zone.distanceMin}km de ${zone.centreLePlusProche})`); continue }

      if (geo.lat) {
        const { data: lieu } = await supabaseAdmin.from('lieux').insert({
          nom: evt.lieu_nom ?? evt.commune,
          adresse: geo.adresse ?? evt.lieu_adresse,
          lat: geo.lat, lng: geo.lng,
          place_id_google: geo.place_id_google,
          commune: evt.commune, code_postal: evt.code_postal,
        }).select('id').single()
        lieuId = lieu?.id ?? null
      }
    }

    const statut      = calcStatut({ categorie: evt.categorie, date_debut: evt.date_debut, description: evt.description, hasGeo: !!geo.lat, commune: evt.commune, adresse: geo.adresse ?? evt.lieu_adresse })
    const finalStatut = check.publier ? statut : 'a_verifier'
    const raisonStatut = !evt.date_debut ? 'Manque date' : !geo.lat ? 'Lieu non géocodé' : !evt.description ? 'Manque description' : (check.raison ?? '')

    const { data: evenement } = await supabaseAdmin.from('evenements').insert({
      titre: evt.titre, description: evt.description,
      date_debut: evt.date_debut || null, date_fin: evt.date_fin || null, heure: evt.heure || null,
      categorie: evt.categorie ?? 'autre', statut: finalStatut,
      lieu_id: lieuId, prix: evt.prix || null, contact: evt.contact || null,
      organisateurs: evt.organisateurs || null, image_url: imageUrl, source,
      message_entrant_id: messageId, raison_statut: raisonStatut || null,
    }).select('id').single()

    if (evenement) {
      if (!firstId) firstId = evenement.id
      if (finalStatut === 'publie') totalPublie++
      else totalAttente++
    }
  }

  const total = totalPublie + totalAttente
  if (total === 0) return { statut: 'non_publiable', raison: reasons.join(' · ') || 'Aucun événement inséré', extraction: events, evenements_crees: 0, premier_evenement_id: null }

  return {
    statut: totalPublie > 0 ? 'publie' : 'en_attente',
    raison: '',
    extraction: events,
    evenements_crees: total,
    premier_evenement_id: firstId,
  }
}
