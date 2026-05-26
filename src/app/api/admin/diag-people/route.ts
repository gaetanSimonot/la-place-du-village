import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * Endpoint diagnostic temporaire : pourquoi /api/people retourne 20 et non 38 ?
 * Compare plusieurs queries via supabaseAdmin (= service_role).
 *
 * Pas de garde auth car visite directe browser (= pas de Bearer token).
 * Aucune donnée sensible exposée (juste des counts + 10 prefix chars de la
 * clé service_role — pas exploitable seul).
 *
 * À SUPPRIMER après diagnostic.
 */

export async function GET() {
  const results: Record<string, unknown> = {}

  // 1. Count profiles total
  const c1 = await supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true })
  results.total_profiles = { count: c1.count, error: c1.error?.message }

  // 2. Count profiles is_public=true AND banned=false
  const c2 = await supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true })
    .eq('is_public', true).eq('banned', false)
  results.profiles_filtered = { count: c2.count, error: c2.error?.message }

  // 3. Count via vue profiles_public_listing (head only)
  const c3 = await supabaseAdmin.from('profiles_public_listing').select('*', { count: 'exact', head: true })
  results.view_count_head = { count: c3.count, error: c3.error?.message }

  // 4. Query EXACTE comme /api/people (avec select + order + limit, count)
  const c4 = await supabaseAdmin
    .from('profiles_public_listing')
    .select('user_id, display_name, avatar_url, ville, genre, is_verified', { count: 'exact' })
    .order('display_name', { ascending: true, nullsFirst: false })
    .limit(200)
  results.api_people_replica = {
    count: c4.count,
    length: c4.data?.length,
    error: c4.error?.message,
    first_3: (c4.data ?? []).slice(0, 3).map((p: { display_name: string | null }) => p.display_name),
    last_3:  (c4.data ?? []).slice(-3).map((p: { display_name: string | null }) => p.display_name),
  }

  // 5. Identité de la clé utilisée (8 premiers chars uniquement, jamais full)
  const key = process.env.SUPABASE_SERVICE_KEY ?? '(missing)'
  results.service_key_fingerprint = {
    length: key.length,
    prefix: key.slice(0, 10),
    looks_like_service_role: key.startsWith('eyJ') && key.length > 100,
  }

  return NextResponse.json(results, { headers: { 'Cache-Control': 'no-store' } })
}
