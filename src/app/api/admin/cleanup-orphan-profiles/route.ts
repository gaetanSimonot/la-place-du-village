import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { cleanupOrphanProfiles } from '@/lib/server-user-delete'

/**
 * Nettoie les profils dont user_id ne correspond plus à un user dans
 * auth.users (orphelins suite à une suppression partielle passée).
 *
 * Admin only. À appeler quand des profils supprimés restent encore
 * visibles dans /people ou dans les suggestions d'amis.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const result = await cleanupOrphanProfiles()
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }
  return NextResponse.json({ deleted: result.deleted })
}
