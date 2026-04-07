import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { transcript, currentForm } = await req.json()

    if (!transcript) {
      return NextResponse.json({ error: 'Transcription manquante' }, { status: 400 })
    }

    const prompt = `Tu es un assistant qui aide à corriger une fiche événement.

Voici le formulaire actuel (JSON) :
${JSON.stringify(currentForm, null, 2)}

L'utilisateur a dit (à l'oral) :
"${transcript}"

Analyse ce que l'utilisateur veut modifier et retourne UNIQUEMENT un objet JSON avec les champs à mettre à jour.
Champs possibles : titre, description, date_debut (format YYYY-MM-DD), date_fin (format YYYY-MM-DD), heure (format HH:MM), categorie, prix, contact, organisateurs, statut.
Ne retourne QUE les champs mentionnés par l'utilisateur. Si rien n'est clair, retourne {}.
Réponds uniquement avec le JSON, sans texte autour.`

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '{}'

    // Extrait le JSON même si Claude ajoute du texte autour
    const match = text.match(/\{[\s\S]*\}/)
    const updates = match ? JSON.parse(match[0]) : {}

    return NextResponse.json({ updates })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur' }, { status: 500 })
  }
}
