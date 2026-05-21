import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

/**
 * GET /api/friends — liste de mes relations.
 *
 * Query params (optionnels) :
 *   ?status=accepted       → seulement mes amis (default)
 *   ?status=pending        → demandes en attente (envoyées OU reçues)
 *   ?status=all            → tout (pending + accepted + blocked)
 *
 * Renvoie : { friendships: Friendship[], profiles: Record<userId, {display_name, avatar_url, ville}> }
 *
 * profiles est joint pour éviter un round-trip UI : on récupère le nom +
 * avatar des "autres" users en même temps.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { searchParams } = new URL(req.url)
  const statusFilter = searchParams.get('status') ?? 'accepted'

  let query = supabaseAdmin
    .from('friendships')
    .select('*')
    .or(`user1_id.eq.${ctx.userId},user2_id.eq.${ctx.userId}`)
    .order('updated_at', { ascending: false })

  if (statusFilter === 'accepted' || statusFilter === 'pending' || statusFilter === 'blocked') {
    query = query.eq('status', statusFilter)
  }
  // 'all' : pas de filtre

  const { data: friendships, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Joint les profils des "autres" users
  const otherIds = Array.from(new Set(
    (friendships ?? []).map(f => f.user1_id === ctx.userId ? f.user2_id : f.user1_id),
  ))

  let profiles: Record<string, { user_id: string; display_name: string | null; avatar_url: string | null; ville: string | null }> = {}
  if (otherIds.length > 0) {
    const { data: profs } = await supabaseAdmin
      .from('profiles')
      .select('user_id, display_name, avatar_url, ville')
      .in('user_id', otherIds)
    profiles = Object.fromEntries(
      ((profs ?? []) as { user_id: string; display_name: string | null; avatar_url: string | null; ville: string | null }[])
        .map(p => [p.user_id, p]),
    )
  }

  return NextResponse.json({ friendships: friendships ?? [], profiles })
}
