import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getPrompt } from '@/lib/prompts-ia'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { transcript, currentForm } = await req.json()

    if (!transcript) {
      return NextResponse.json({ error: 'Transcription manquante' }, { status: 400 })
    }

    const prompt = await getPrompt('voice_edit', {
      currentForm: JSON.stringify(currentForm, null, 2),
      transcript,
    })

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
