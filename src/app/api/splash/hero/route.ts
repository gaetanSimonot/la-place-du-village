import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/server-auth'

export const dynamic = 'force-dynamic'

/**
 * POST (admin) — règle l'image héro du splash (slot dédié, indépendant du hub).
 * Body = { url: string } (URL publique de l'image, '' pour réinitialiser).
 * Stocké dans config('splash_hero_image_url').
 */
export async function POST(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx
  const body = await req.json().catch(() => ({}))
  const value = typeof body.url === 'string' ? body.url : ''
  const { error } = await supabaseAdmin.from('config').upsert({ key: 'splash_hero_image_url', value }, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
