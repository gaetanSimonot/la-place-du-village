import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireUser } from '@/lib/server-auth'

// Client local créé à chaque request (pas le singleton supabaseAdmin partagé).
// Diagnostic du 2026-05-26 : le singleton retournait 20 profils au lieu de 38
// quand /api/people était appelé après requireUser → suspect de pollution
// d'état interne par auth.getUser(token). Le client local fresh garantit un
// service_role propre pour cette query.
function freshAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

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

  // `total` = count des profiles total (= /admin/membres = bouton "Les gens"
  // du Hub). Affiché comme "X membres" en haut de la page. On compte les
  // profiles SANS filtre is_public (= peut différer du nombre de profils
  // listés ci-dessous quand certains se sont masqués). Cohérence avec
  // /api/hub.zoneCounts.people pour avoir UN seul chiffre dans toute l'app.
  const admin = freshAdmin()

  if (q.length >= 2) {
    const [listRes, countRes] = await Promise.all([
      admin
        .from('profiles_searchable')
        .select('user_id, display_name, avatar_url, ville')
        .or(`display_name.ilike.%${q}%,ville.ilike.%${q}%`)
        .order('display_name', { ascending: true, nullsFirst: false })
        .limit(PAGE_LIMIT),
      admin.from('profiles').select('*', { count: 'exact', head: true }),
    ])
    if (listRes.error) return NextResponse.json({ error: listRes.error.message }, { status: 500 })
    return NextResponse.json({ people: listRes.data ?? [], total: countRes.count ?? 0 }, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  }

  // Mode browse
  const [listRes, countRes] = await Promise.all([
    admin
      .from('profiles_public_listing')
      .select('user_id, display_name, avatar_url, ville, genre, is_verified')
      .order('display_name', { ascending: true, nullsFirst: false })
      .limit(PAGE_LIMIT),
    admin.from('profiles').select('*', { count: 'exact', head: true }),
  ])
  if (listRes.error) return NextResponse.json({ error: listRes.error.message }, { status: 500 })
  return NextResponse.json({ people: listRes.data ?? [], total: countRes.count ?? 0 }, {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
