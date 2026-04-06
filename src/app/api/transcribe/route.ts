import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const audio = formData.get('audio') as File | null

    if (!audio) {
      return NextResponse.json({ error: 'Fichier audio manquant' }, { status: 400 })
    }

    const openaiForm = new FormData()
    openaiForm.append('file', audio, 'recording.webm')
    openaiForm.append('model', 'whisper-1')
    openaiForm.append('language', 'fr')

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: openaiForm,
    })

    const data = await res.json()

    if (!res.ok) {
      return NextResponse.json({ error: data.error?.message ?? 'Erreur Whisper' }, { status: 500 })
    }

    return NextResponse.json({ text: data.text })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
