import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export async function GET() {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return NextResponse.json({ error: 'ANTHROPIC_API_KEY manquante' }, { status: 500 })

  try {
    const anthropic = new Anthropic({ apiKey: key })
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Dis juste "ok"' }],
    })
    return NextResponse.json({
      ok: true,
      key_prefix: key.slice(0, 20) + '...',
      model: 'claude-haiku-4-5-20251001',
      response: response.content[0],
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; error?: unknown }
    return NextResponse.json({
      ok: false,
      key_prefix: key.slice(0, 20) + '...',
      status: e.status,
      message: e.message,
      error: e.error,
    }, { status: 200 })
  }
}
