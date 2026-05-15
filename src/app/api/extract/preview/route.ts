import { NextRequest, NextResponse } from 'next/server'
import { extractMultipleWithClaude } from '@/lib/extract'
import { requireUser } from '@/lib/server-auth'
import { rateLimit } from '@/lib/rateLimit'

// Extrait les données sans insérer en base — utilisé par le formulaire pour la preview
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireUser(req)
    if (ctx instanceof Response) return ctx

    const blocked = await rateLimit(ctx.userId, 'ai_extract', ctx.plan, ctx.isAdmin)
    if (blocked) return blocked

    const { text, image, imageMimeType } = await req.json()

    if (!text?.trim() && !image) {
      return NextResponse.json({ error: 'Texte ou image requis' }, { status: 400 })
    }

    const events = await extractMultipleWithClaude(text || null, image, imageMimeType)

    return NextResponse.json({ events })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
