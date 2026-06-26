import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/server-auth'

export const dynamic = 'force-dynamic'

/**
 * POST (admin) — enregistre l'élément mis en avant dans la rubrique « À découvrir »
 * du splash. Body = EmbedItem { kind, id, title, subtitle, photo } (ou null pour effacer).
 * Stocké dans config('splash_decouvrir').
 */
export async function POST(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx
  const body = await req.json().catch(() => ({}))
  const value = body && body.kind && body.id
    ? JSON.stringify({
        kind: String(body.kind),
        id: String(body.id),
        title: String(body.title ?? ''),
        subtitle: body.subtitle != null ? String(body.subtitle) : null,
        photo: body.photo != null ? String(body.photo) : null,
      })
    : ''
  const { error } = await supabaseAdmin.from('config').upsert({ key: 'splash_decouvrir', value }, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
