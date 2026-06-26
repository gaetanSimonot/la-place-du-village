import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/server-auth'

export const dynamic = 'force-dynamic'

/**
 * Bibliothèque d'images de l'admin (URLs réutilisables pour les slots : héro du
 * splash, etc.). Stockée dans config('image_library') = JSON array d'URLs.
 *
 * GET (public)  → { images }
 * POST (admin)  → { url } ajoute (prepend, dédup) ; { url, remove:true } retire.
 */
const KEY = 'image_library'

async function read(): Promise<string[]> {
  const { data } = await supabaseAdmin.from('config').select('value').eq('key', KEY).maybeSingle()
  try {
    const a = data?.value ? JSON.parse(data.value) : []
    return Array.isArray(a) ? a.filter((x: unknown): x is string => typeof x === 'string') : []
  } catch { return [] }
}

export async function GET() {
  return NextResponse.json({ images: await read() })
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx
  const body = await req.json().catch(() => ({}))
  const url = typeof body.url === 'string' ? body.url : ''
  if (!url) return NextResponse.json({ error: 'url manquante' }, { status: 400 })
  let list = await read()
  list = body.remove ? list.filter(u => u !== url) : [url, ...list.filter(u => u !== url)]
  const { error } = await supabaseAdmin.from('config').upsert({ key: KEY, value: JSON.stringify(list) }, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ images: list })
}
