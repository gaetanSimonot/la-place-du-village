import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  extractMultipleWithClaude,
  geocodeWithGoogle,
  calcStatut,
  type ExtractedData,
  type GeoResult,
} from '@/lib/extract'
import { regrouperRecurrences } from '@/lib/recurrences'
import { trouverOuCreerLieu } from '@/lib/lieuxResolve'
import { checkDoublon } from '@/lib/checkDoublon'
import { requireUser } from '@/lib/server-auth'
import { rateLimit } from '@/lib/rateLimit'
import { validateImageUpload } from '@/lib/imageUpload'

// Pro Vercel : sur une affiche dense (15-20 events), on enchaîne séquentiellement
// extract Claude + N × (checkDoublon Claude + geocode + insert). Comptez ~5s/event
// pour la dédup Claude (timeout interne 7s) + insert. On donne 60s de marge.
export const maxDuration = 60

// Client service role pour l'upload Storage (contourne les RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

async function uploadImageToStorage(base64: string, mimeType: string): Promise<string | null> {
  const v = validateImageUpload(base64, mimeType)
  if (!v.ok) {
    console.warn('[extract] image refusée:', v.error)
    return null
  }
  try {
    const filename = `whatsapp/${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${v.ext}`

    const { error } = await supabaseAdmin.storage
      .from('event-images')
      .upload(filename, v.buffer, { contentType: v.mimeType, upsert: false })

    if (error) {
      console.error('Upload image error:', error.message)
      return null
    }

    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('event-images')
      .getPublicUrl(filename)

    return publicUrl
  } catch (e) {
    console.error('Upload image exception:', e)
    return null
  }
}

interface ProcessedEvent {
  ok: true
  id: string
  titre: string
  statut: string
}
interface ProcessedSkip {
  ok: false
  reason: 'duplicate' | 'lieu_insert_error' | 'event_insert_error'
  titre: string | null
  doublon_id?: string | null
  error?: string
}
type ProcessResult = ProcessedEvent | ProcessedSkip

/**
 * Traite UN event extrait : dédup Claude → geocode → insert lieu → insert event.
 * Séquentiel intentionnellement (pas Promise.all) pour que la dédup d'un event N
 * voie l'event N-1 fraîchement inséré (sinon doublons intra-batch garantis sur
 * les affiches qui répètent un event sous plusieurs angles).
 */
async function processOneEvent(
  extracted: ExtractedData,
  source: string,
  sourceGroupe: string | null,
  sourceAuteur: string | null,
  sourceTelephone: string | null,
  imageUrl: string | null,
): Promise<ProcessResult> {
  // 1. Dédup Claude-powered (cf. src/lib/checkDoublon.ts) — plus fiable que le
  // simple titre+date utilisé avant. Timeout 7s interne, retourne publier:false
  // en cas d'incertitude (events seront en statut a_verifier).
  const dup = await checkDoublon({
    titre: extracted.titre,
    date_debut: extracted.date_debut,
    commune: extracted.commune,
    lieu_nom: extracted.lieu_nom,
    description: extracted.description,
  })

  if (dup.doublon) {
    return { ok: false, reason: 'duplicate', titre: extracted.titre, doublon_id: dup.doublon_id }
  }

  // 2. Geocode + insertion lieu (si lieu fourni)
  let lieuId: string | null = null
  let geo: GeoResult = { place_id_google: null, lat: null, lng: null, adresse: null, approx: false }

  if (extracted.lieu_nom || extracted.commune) {
    geo = await geocodeWithGoogle(extracted.lieu_nom, extracted.commune)
    // On CHERCHE le lieu avant d'en créer un. L'insertion sèche d'avant a
    // laissé 1134 lignes dans `lieux` pour ~285 lieux réels — « Le petit
    // dojo » 88 fois — et privait la vérification anti-doublon de son
    // meilleur repère : deux copies du même événement ne partageaient pas
    // leur lieu.
    const lieu = await trouverOuCreerLieu(
      extracted.lieu_nom ?? extracted.commune ?? '',
      extracted.commune,
      { lat: geo.lat, lng: geo.lng, adresse: geo.adresse ?? extracted.lieu_adresse, place_id_google: geo.place_id_google },
    )
    if (!lieu.id) {
      return {
        ok: false,
        reason: 'lieu_insert_error',
        titre: extracted.titre,
        error: lieu.error ?? 'lieu_insert_failed',
      }
    }
    lieuId = lieu.id
  }

  // 3. Statut : combine calcStatut + override "publier" du check doublon (si
  // checkDoublon est en doute mais pas certain → a_verifier au lieu de publie).
  const baseStatut = calcStatut({
    categorie: extracted.categorie,
    date_debut: extracted.date_debut,
    description: extracted.description,
    hasGeo: !!geo.lat,
    commune: extracted.commune,
    adresse: geo.adresse ?? extracted.lieu_adresse,
  })
  const statut = dup.publier ? baseStatut : 'a_verifier'

  // 4. Insert event
  const { data: evt, error: evtErr } = await supabaseAdmin
    .from('evenements')
    .insert({
      titre: extracted.titre,
      description: extracted.description,
      date_debut: extracted.date_debut,
      date_fin: extracted.date_fin,
      heure: extracted.heure,
      categorie: extracted.categorie ?? 'autre',
      categories: [extracted.categorie ?? 'autre'],
      statut,
      lieu_id: lieuId,
      prix: extracted.prix,
      contact: extracted.contact,
      organisateurs: extracted.organisateurs,
      image_url: imageUrl,
      source,
      source_groupe:    sourceGroupe,
      source_auteur:    sourceAuteur,
      source_telephone: sourceTelephone,
    })
    .select('id, titre, statut')
    .single()

  if (evtErr || !evt) {
    return {
      ok: false,
      reason: 'event_insert_error',
      titre: extracted.titre,
      error: evtErr?.message ?? 'event_insert_failed',
    }
  }

  return { ok: true, id: evt.id, titre: evt.titre, statut: evt.statut }
}

/**
 * POST /api/extract — extrait N événements d'un message (texte + image).
 *
 * Sources acceptées :
 *   - 'whatsapp' / 'signal' : auth via header x-wa-key (sender VM/collector)
 *   - 'formulaire' / autre  : auth user authentifié + rate-limit
 *
 * Pipeline pour CHAQUE event extrait :
 *   1. checkDoublon (Claude) → skip si doublon avéré
 *   2. geocode + insert lieu (si lieu fourni)
 *   3. calcStatut + override "publier" du check doublon
 *   4. insert event
 *
 * Réponse :
 *   { success: bool, evenement: 1er event créé (rétrocompat), events: [...],
 *     created: N, skipped: M, skippedDetails: [...], statut: string }
 *
 * Le sender VM Signal lit `data.statut` pour son log "→ <statut>".
 */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      text, image, imageMimeType,
      source = 'formulaire',
      source_groupe, source_auteur, source_telephone,
    } = body

    // Auth : sources webhook (whatsapp/signal) requièrent la clé x-wa-key,
    // sinon user authentifié + rate-limit (formulaire admin).
    if (source === 'whatsapp' || source === 'signal') {
      const waKey = req.headers.get('x-wa-key')
      if (!waKey || waKey !== process.env.WHATSAPP_API_KEY) {
        return NextResponse.json({ error: 'Clé API invalide' }, { status: 401 })
      }
    } else {
      const ctx = await requireUser(req)
      if (ctx instanceof Response) return ctx

      const blocked = await rateLimit(ctx.userId, 'ai_extract', ctx.plan, ctx.isAdmin)
      if (blocked) return blocked
    }

    // Au moins texte ou image requis
    if (!text?.trim() && !image) {
      return NextResponse.json({ error: 'Texte ou image requis' }, { status: 400 })
    }

    // Upload image une fois (mutualisé entre tous les events extraits du même message)
    let imageUrl: string | null = null
    if (image) {
      imageUrl = await uploadImageToStorage(image, imageMimeType || 'image/jpeg')
    }

    // Slice sécurité provenance
    const sourceGroupe    = typeof source_groupe    === 'string' ? source_groupe.slice(0, 200) : null
    const sourceAuteur    = typeof source_auteur    === 'string' ? source_auteur.slice(0, 200) : null
    const sourceTelephone = typeof source_telephone === 'string' ? source_telephone.slice(0, 40)  : null

    // Multi-extraction Claude. extractMultipleWithClaude filtre déjà les events
    // sans titre (cf. src/lib/extract.ts), donc tableau retourné = events
    // avec titre non-vide. Si tableau vide → message non-event, on retourne
    // 200 sans erreur pour que le sender VM classe en processed.
    const extractedEvents = await extractMultipleWithClaude(text || null, image, imageMimeType)

    if (extractedEvents.length === 0) {
      return NextResponse.json({
        success: false,
        reason: 'no_events',
        created: 0,
        skipped: 0,
        events: [],
        statut: 'no_event',
      })
    }

    // Les créneaux qui se répètent sont fondus AVANT tout traitement : une
    // seule fiche part au géocodage, à la dédup et en base, au lieu de trente.
    const aTraiter = regrouperRecurrences(extractedEvents)

    // Process chaque event séquentiellement (cf. note sur la dédup intra-batch
    // dans processOneEvent).
    const created: Array<{ id: string; titre: string; statut: string }> = []
    const skipped: Array<{ reason: string; titre: string | null; doublon_id?: string | null; error?: string }> = []

    for (const extracted of aTraiter) {
      const result = await processOneEvent(
        extracted, source, sourceGroupe, sourceAuteur, sourceTelephone, imageUrl,
      )
      if (result.ok) {
        created.push({ id: result.id, titre: result.titre, statut: result.statut })
      } else {
        skipped.push({
          reason: result.reason,
          titre: result.titre,
          doublon_id: result.doublon_id,
          error: result.error,
        })
      }
    }

    const firstEvent = created[0] ?? null
    return NextResponse.json({
      success: created.length > 0,
      evenement: firstEvent,        // rétrocompat (1er event créé)
      events: created,              // nouveau (multi)
      created: created.length,
      skipped: skipped.length,
      skippedDetails: skipped,
      // Statut consommé par le sender VM pour son log "→ <statut>". On compose
      // un résumé lisible : ex. "3 cree(s), 2 doublon(s)".
      statut: created.length > 0
        ? (created.length === 1 ? firstEvent!.statut : `${created.length} crees, ${skipped.length} ignores`)
        : (skipped.length > 0 ? `0 cree, ${skipped.length} ignores` : 'no_event'),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
