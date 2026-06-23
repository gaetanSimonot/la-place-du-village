import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/server-auth'

/**
 * GET /api/admin/newsletter — compteurs des deux listes d'envoi.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const [sub, non] = await Promise.all([
    supabaseAdmin.from('profiles').select('user_id', { count: 'exact', head: true }).eq('newsletter_optin', true).not('email', 'is', null),
    supabaseAdmin.from('profiles').select('user_id', { count: 'exact', head: true }).eq('newsletter_optin', false).not('email', 'is', null),
  ])
  return NextResponse.json({ subscribers: sub.count ?? 0, nonSubscribers: non.count ?? 0 })
}
