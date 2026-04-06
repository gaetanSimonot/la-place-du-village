import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { geocodeWithGoogle, calcStatut } from '@/lib/extract'
import { Categorie } from '@/lib/types'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

async function uploadImage(base64: string, mimeType: string): Promise<string | null> {
  try {
    const buffer = Buffer.from(base64, 'base64')
    const ext = mimeType.split('/')[1]?.split(';')[0] || 'jpg'
    const filename = `formulaire/${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${ext}`
    const { error } = await supabaseAdmin.storage
      .from('event-images')
      .upload(filename, buffer, { contentType: mimeType, upsert: false })
    if (error) { console.error('Upload error:', error.message); return null }
    const { data: { publicUrl } } = supabaseAdmin.storage.from('event-images').getPublicUrl(filename)
    return publicUrl
  } catch (e) { console.error('Upload exception:', e); return null }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      titre, description, date_debut, date_fin, heure,
      categorie, lieu_nom, lieu_adresse, commune, code_postal,
      prix, contact, organisateurs, image, imageMimeType,
    } = body

    if (!titre?.trim()) {
      return NextResponse.json({ error: 'Le titre est requis' }, { status: 400 })
    }

    const imageUrl = image ? await uploadImage(image, imageMimeType || 'image/jpeg') : null

    let lieuId: string | null = null
    let geo = { place_id_google: null as string | null, lat: null as number | null, lng: null as number | null, adresse: null as string | null, approx: false }

    if (lieu_nom?.trim() || commune?.trim()) {
      geo = await geocodeWithGoogle(lieu_nom || null, commune || null)

      const { data: lieu, error: lieuErr } = await supabase
        .from('lieux')
        .insert({
          nom: lieu_nom,
          adresse: geo.adresse ?? lieu_adresse ?? null,
          lat: geo.lat,
          lng: geo.lng,
          place_id_google: geo.place_id_google,
          commune: commune ?? null,
          code_postal: code_postal ?? null,
        })
        .select('id')
        .single()

      if (lieuErr) throw new Error(`Erreur insertion lieu : ${lieuErr.message}`)
      lieuId = lieu.id
    }

    const statut = calcStatut({
      categorie,
      date_debut: date_debut || null,
      description: description || null,
      hasGeo: !!geo.lat,
      commune: commune || null,
      adresse: geo.adresse ?? lieu_adresse ?? null,
    })

    const { data: evenement, error: evtErr } = await supabase
      .from('evenements')
      .insert({
        titre,
        description: description || null,
        date_debut: date_debut || null,
        date_fin: date_fin || null,
        heure: heure || null,
        categorie: (categorie as Categorie) ?? 'autre',
        statut,
        lieu_id: lieuId,
        prix: prix || null,
        contact: contact || null,
        organisateurs: organisateurs || null,
        image_url: imageUrl,
        source: 'formulaire',
      })
      .select()
      .single()

    if (evtErr) throw new Error(`Erreur insertion événement : ${evtErr.message}`)

    return NextResponse.json({ success: true, evenement })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
