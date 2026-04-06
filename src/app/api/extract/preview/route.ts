import { NextRequest, NextResponse } from 'next/server'
import { extractWithClaude, geocodeWithGoogle } from '@/lib/extract'

// Extrait les données sans insérer en base — utilisé par le formulaire pour la preview
export async function POST(req: NextRequest) {
  try {
    const { text, image, imageMimeType } = await req.json()

    if (!text?.trim() && !image) {
      return NextResponse.json({ error: 'Texte ou image requis' }, { status: 400 })
    }

    const extracted = await extractWithClaude(text || null, image, imageMimeType)

    let geo = { place_id_google: null as string | null, lat: null as number | null, lng: null as number | null, adresse: null as string | null }
    if (extracted.lieu_nom) {
      geo = await geocodeWithGoogle(extracted.lieu_nom, extracted.commune)
    }

    return NextResponse.json({ extracted, geo })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
