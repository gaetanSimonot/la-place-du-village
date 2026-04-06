import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { extractWithClaude, geocodeWithGoogle, calcStatut } from '@/lib/extract'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { text, image, source = 'formulaire' } = body

    if (!text?.trim()) {
      return NextResponse.json({ error: 'Le champ text est requis' }, { status: 400 })
    }

    const extracted = await extractWithClaude(text, image)

    let lieuId: string | null = null
    let geo = { place_id_google: null as string | null, lat: null as number | null, lng: null as number | null, adresse: null as string | null, approx: false }

    if (extracted.lieu_nom || extracted.commune) {
      geo = await geocodeWithGoogle(extracted.lieu_nom, extracted.commune)

      const { data: lieu, error: lieuErr } = await supabase
        .from('lieux')
        .insert({
          nom: extracted.lieu_nom,
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
