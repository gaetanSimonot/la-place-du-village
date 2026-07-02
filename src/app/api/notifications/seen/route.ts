import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

export const dynamic = 'force-dynamic'

/**
 * POST /api/notifications/seen — marque lues les notifications de l'user
 * correspondant à un contenu qu'il vient de CONSULTER (ex : il regarde un
 * reel → la notif « moment_nouveau » de ce reel est lue, badges effacés).
 * Body : { type: string, target_id: string }
 */
export async function POST(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const body = await req.json().catch(() => ({}))
  const type = typeof body?.type === 'string' ? body.type : ''
  const targetId = typeof body?.target_id === 'string' ? body.target_id : ''
  if (!type || !targetId) return NextResponse.json({ error: 'type et target_id requis' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('notifications')
    .update({ lu: true })
    .eq('user_id', ctx.userId)
    .eq('type', type)
    .eq('target_id', targetId)
    .eq('lu', false)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
