import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

/**
 * GET /api/people — annuaire des profils (page /people).
 *
 * Lit profiles_public_listing (mode browse) ou profiles_searchable (mode
 * search) selon le query param `q`.
 *
 * Query params :
 *   ?q=texte_recherche    si q.length >= 2 → search
 *                          sinon → browse
 *
 * PERSO (requireUser) car /people est réservée aux loggés.
 * Cache-Control: private, no-store (perso).
 */

export const dynamic = 'force-dynamic'

const PAGE_LIMIT = 200

export async function GET(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') ?? '').trim()

  if (q.length >= 2) {
    const { data, error } = await supabaseAdmin
      .from('profiles_searchable')
      .select('user_id, display_name, avatar_url, ville')
      .or(`display_name.ilike.%${q}%,ville.ilike.%${q}%`)
      .order('display_name', { ascending: true, nullsFirst: false })
      .limit(PAGE_LIMIT)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ people: data ?? [] }, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  }

  // Mode browse
  const { data, error } = await supabaseAdmin
    .from('profiles_public_listing')
    .select('user_id, display_name, avatar_url, ville, genre, is_verified')
    .order('display_name', { ascending: true, nullsFirst: false })
    .limit(PAGE_LIMIT)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ people: data ?? [] }, {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
