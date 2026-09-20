import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  extractMultipleWithClaude,
  geocodeWithGoogle,
  nettoyerJoursSemaine,
  calcStatut,
  communeDepuisAdresse,
  ressembleAUneAdresse,
  type ExtractedData,
  type GeoResult,
} from '@/lib/extract'
import { regrouperRecurrences } from '@/lib/recurrences'
import { territoirePourIngestion, territoireDuPoint, indiceGeoDe, type Territoire } from '@/lib/territoires'
import { trouverOuCreerLieu } from '@/lib/lieuxResolve'
import { datesDepuisExtraction } from '@/lib/occurrences'
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
  reason: 'duplicate' | 'hors_zone' | 'lieu_insert_error' | 'event_insert_error'
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
  territoirePresume: Territoire | null,
): Promise<ProcessResult> {
  // Presomption du groupe, revue par la geographie plus bas.
  let territoire = territoirePresume
  // 1. Dédup Claude-powered (cf. src/lib/checkDoublon.ts) — plus fiable que le
  // simple titre+date utilisé avant. Timeout 7s interne, retourne publier:false
  // en cas d'incertitude (events seront en statut a_verifier).
  const dup = await checkDoublon({
    titre: extracted.titre,
    date_debut: extracted.date_debut,
    heure: extracted.heure,
    commune: extracted.commune,
    lieu_nom: extracted.lieu_nom,
    description: extracted.description,
    territoire_id: territoire?.id ?? null,
  })

  if (dup.doublon) {
    return { ok: false, reason: 'duplicate', titre: extracted.titre, doublon_id: dup.doublon_id }
  }

  // 2. Geocode + insertion lieu (si lieu fourni)
  let lieuId: string | null = null
  let geo: GeoResult = { place_id_google: null, lat: null, lng: null, adresse: null, approx: false }

  if (extracted.lieu_nom || extracted.commune) {
    // Avec le repère du secteur, comme le chemin WhatsApp : sans lui Google
    // rend l'homonyme le plus célèbre, et « Bréau » — à 12 km — partait en
    // Seine-et-Marne, à 518. Le contrôle de zone écartait ensuite un lieu
    // parfaitement local.
    geo = await geocodeWithGoogle(extracted.lieu_nom, extracted.commune, {
      indiceGeo: indiceGeoDe(territoire),
      adresse: extracted.lieu_adresse,
      codePostal: extracted.code_postal,
    })

    /*
     * LE GROUPE PRESUME, LA GEOGRAPHIE TRANCHE — meme regle que le chemin
     * WhatsApp. Le territoire de la source a oriente le geocodage ci-dessus ;
     * le point, une fois connu, decide du rangement. Un evenement annonce
     * dans un groupe cevenol mais qui se tient a Pau part a Pau, sans que
     * personne n'ait rien a declarer. Aucun appel de plus : on ne fait que
     * des soustractions sur des coordonnees.
     *
     * TROP LOIN : ON REFUSE. Ce controle protegeait le formulaire, WhatsApp
     * et les scrapers — mais PAS cette route, celle par laquelle Signal
     * ecrit. Constate le 17/09/2026 : 56 lieux au-dela de 95 km, et 5
     * evenements Signal poses dessus.
     *
     * Il se juge AVANT la creation du lieu, pour deux raisons : le lieu doit
     * naitre dans le bon territoire, et un refus ne doit pas laisser une
     * fiche de lieu orpheline derriere lui.
     *
     * Sans coordonnees, on laisse passer avec la presomption du groupe : on
     * ne refuse pas ce qu'on n'a pas pu situer, et une affiche sans adresse
     * reste utile.
     */
    if (geo.lat != null && geo.lng != null) {
      const arbitrage = await territoireDuPoint(geo.lat, geo.lng)
      if (!arbitrage.territoire) {
        return {
          ok: false,
          reason: 'hors_zone',
          titre: extracted.titre,
          error: `${arbitrage.distanceKm} km de ${arbitrage.centreLePlusProche} — hors de toutes les zones`,
        }
      }
      territoire = arbitrage.territoire
    }

    // On CHERCHE le lieu avant d'en créer un. L'insertion sèche d'avant a
    // laissé 1134 lignes dans `lieux` pour ~285 lieux réels — « Le petit
    // dojo » 88 fois — et privait la vérification anti-doublon de son
    // meilleur repère : deux copies du même événement ne partageaient pas
    // leur lieu.
    // Ce que le modele a lu prime ; l'adresse ne comble que le vide.
    const communeReelle = extracted.commune || communeDepuisAdresse(geo.adresse)
      /*
     * LE NOM DU LIEU, QUAND L'ANNONCE N'EN DONNE PAS.
     *
     * Retomber sur le nom de la commune donne une punaise « Le Vigan » au
     * milieu du village, la ou l'annonce disait « 70 route du Pont de la
     * Croix ». L'adresse est un bien meilleur intitule : elle situe, elle
     * se reconnait, et elle est ce que la personne lira sur la fiche.
     */
/*
     * STRICT POUR LE POINT, SOUPLE POUR L'INTITULE — ce n'est pas le meme risque.
     *
     * Un point faux a l'air juste : on le croit, on s'y rend, et c'est une soiree
     * perdue. On n'envoie donc a Google que ce qui ressemble vraiment a une
     * adresse postale (`ressembleAUneAdresse`).
     *
     * Un intitule, lui, n'est que du texte a lire. « Voie verte reliant Le Vigan
     * a Arre » ne se geocode pas, mais c'est infiniment mieux que « Le Vigan »
     * pour savoir ou l'on va. Des que l'annonce donne un repere et aucun nom de
     * lieu, ce repere devient l'intitule.
     */
    const intitule = extracted.lieu_nom || extracted.lieu_adresse?.trim() || communeReelle || ''
    const lieu = await trouverOuCreerLieu(
      intitule,
      communeReelle,
      {
        lat: geo.lat, lng: geo.lng,
        // L'annonce fait autorite sur l'ADRESSE, Google sur le POINT : la
        // recherche de lieux rend le numero le plus proche qu'elle connaisse,
        // et « 96 bis » devenait « 88 ».
        adresse: ressembleAUneAdresse(extracted.lieu_adresse) ? extracted.lieu_adresse : (geo.adresse ?? extracted.lieu_adresse),
        place_id_google: geo.place_id_google,
        territoire_id: territoire?.id ?? null,
      },
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
  // Le calendrier se deroule ici, pas dans le modele — voir
  // datesDepuisExtraction. Les bornes suivent la liste obtenue.
  const occ = datesDepuisExtraction({
    date_debut: extracted.date_debut, date_fin: extracted.date_fin,
    jours_semaine: nettoyerJoursSemaine(extracted.jours_semaine), dates: extracted.dates,
  })

  const { data: evt, error: evtErr } = await supabaseAdmin
    .from('evenements')
    .insert({
      titre: extracted.titre,
      description: extracted.description,
      date_debut: occ.date_debut,
      date_fin: occ.date_fin,
      heure: extracted.heure,
      categorie: extracted.categorie ?? 'autre',
      categories: [extracted.categorie ?? 'autre'],
      jours_semaine: nettoyerJoursSemaine(extracted.jours_semaine),
      dates: occ.dates,
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
      ...(territoire ? { territoire_id: territoire.id } : {}),
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
    // `facebook` rejoint les sources webhook : le collecteur PC s'authentifie
    // par la meme cle que le telephone. Sans cette ligne il tombait sur
    // requireUser et recevait un 401 qu'il aurait pris pour une panne.
    if (source === 'whatsapp' || source === 'signal' || source === 'facebook') {
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
    /*
     * Le territoire du message, resolu UNE fois pour toute l'affiche : le champ
     * `territoire` du payload prime, sinon le groupe, sinon le defaut. Un slug
     * inconnu est refuse plutot que range au mauvais endroit.
     */
    const resTerr = await territoirePourIngestion(body?.territoire, source, sourceGroupe)
    if (!resTerr.ok) {
      return NextResponse.json({
        error: `Territoire inconnu : « ${resTerr.slugInconnu} ». Rien n'a ete enregistre.`,
        territoire_inconnu: resTerr.slugInconnu,
      }, { status: 400 })
    }
    const territoire = resTerr.territoire

    const aTraiter = regrouperRecurrences(extractedEvents)

    // Process chaque event séquentiellement (cf. note sur la dédup intra-batch
    // dans processOneEvent).
    const created: Array<{ id: string; titre: string; statut: string }> = []
    const skipped: Array<{ reason: string; titre: string | null; doublon_id?: string | null; error?: string }> = []

    for (const extracted of aTraiter) {
      const result = await processOneEvent(
        extracted, source, sourceGroupe, sourceAuteur, sourceTelephone, imageUrl, territoire,
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
