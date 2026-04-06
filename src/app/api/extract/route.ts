import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { extractWithClaude, geocodeWithGoogle, calcStatut } from '@/lib/extract'

// Client service role pour l'upload Storage (contourne les RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

async function uploadImageToStorage(base64: string, mimeType: string): Promise<string | null> {
  try {
    const buffer = Buffer.from(base64, 'base64')
    const ext = mimeType.split('/')[1]?.split(';')[0] || 'jpg'
    const filename = `whatsapp/${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${ext}`

    const { error } = await supabaseAdmin.storage
      .from('event-images')
      .upload(filename, buffer, { contentType: mimeType, upsert: false })

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { text, image, imageMimeType, source = 'formulaire' } = body

    // Auth : source whatsapp requiert la clé x-wa-key
    if (source === 'whatsapp') {
      const waKey = req.headers.get('x-wa-key')
      if (!waKey || waKey !== process.env.WHATSAPP_API_KEY) {
        return NextResponse.json({ error: 'Clé API invalide' }, { status: 401 })
      }
    }

    // Au moins texte ou image requis
    if (!text?.trim() && !image) {
      return NextResponse.json({ error: 'Texte ou image requis' }, { status: 400 })
    }

    // Upload image vers Supabase Storage
    let imageUrl: string | null = null
    if (image) {
      imageUrl = await uploadImageToStorage(image, imageMimeType || 'image/jpeg')
    }

    const extracted = await extractWithClaude(text || null, image, imageMimeType)

    // Déduplication : même titre (insensible casse) + même date → doublon
    if (extracted.titre && extracted.date_debut) {
      const { data: existing } = await supabase
        .from('evenements')
        .select('id')
        .ilike('titre', extracted.titre)
        .eq('date_debut', extracted.date_debut)
        .limit(1)
        .maybeSingle()

      if (existing) {
        return NextResponse.json({ success: false, duplicate: true, id: existing.id })
      }
    }

    let lieuId: string | null = null
    let geo = { place_id_google: null as string | null, lat: null as number | null, lng: null as number | null, adresse: null as string | null, approx: false }

    if (extracted.lieu_nom || extracted.commune) {
      geo = await geocodeWithGoogle(extracted.lieu_nom, extracted.commune)

      const { data: lieu, error: lieuErr } = await supabase
        .from('lieux')
        .insert({
          nom: extracted.lieu_nom ?? extracted.commune,
          adresse: geo.adresse ?? extracted.lieu_adresse,
          lat: geo.lat,
          lng: geo.lng,
          place_id_google: geo.place_id_google,
          commune: extracted.commune,
          code_postal: extracted.code_postal,
        })
        .select('id')
        .single()

      if (lieuErr) throw new Error(`Erreur insertion lieu : ${lieuErr.message}`)
      lieuId = lieu.id
    }

    const statut = calcStatut({
      categorie: extracted.categorie,
      date_debut: extracted.date_debut,
      description: extracted.description,
      hasGeo: !!geo.lat,
      commune: extracted.commune,
      adresse: geo.adresse ?? extracted.lieu_adresse,
    })

    const { data: evenement, error: evtErr } = await supabase
      .from('evenements')
      .insert({
        titre: extracted.titre,
        description: extracted.description,
        date_debut: extracted.date_debut,
        date_fin: extracted.date_fin,
        heure: extracted.heure,
        categorie: extracted.categorie ?? 'autre',
        statut,
        lieu_id: lieuId,
        prix: extracted.prix,
        contact: extracted.contact,
        organisateurs: extracted.organisateurs,
        image_url: imageUrl,
        source,
      })
      .select()
      .single()

    if (evtErr) throw new Error(`Erreur insertion événement : ${evtErr.message}`)

    return NextResponse.json({ success: true, evenement, statut })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
