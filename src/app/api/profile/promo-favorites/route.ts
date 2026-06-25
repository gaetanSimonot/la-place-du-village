import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

export const dynamic = 'force-dynamic'

/** GET — ids des promotions mises en favori par l'utilisateur connecté. */
export async function GET(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { data } = await supabaseAdmin
    .from('promotion_favorites')
    .select('promotion_id')
    .eq('user_id', ctx.userId)

  return NextResponse.json({ ids: (data ?? []).map(r => r.promotion_id as string) })
}
