import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/server-auth'
import { generateJournalDraft, type SpotlightOverride } from '@/lib/journal-generator'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx
  if (!ctx.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Override spotlight optionnel : si l admin choisit avant la generation,
  // on le passe au generator -> utilise dans le prompt Claude (cohérent) ET
  // stocke en spotlight_etab_id/spotlight_kind du brouillon.
  let spotlight: SpotlightOverride | undefined
  try {
    const body = await req.json().catch(() => ({}))
    if (body?.spotlight?.id && (body.spotlight.kind === 'etablissement' || body.spotlight.kind === 'producteur')) {
      spotlight = { kind: body.spotlight.kind, id: String(body.spotlight.id) }
    }
  } catch {}

  try {
    const { id, numero } = await generateJournalDraft(spotlight)
    return NextResponse.json({ id, numero })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
