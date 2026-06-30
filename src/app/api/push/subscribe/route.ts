import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

export const dynamic = 'force-dynamic'

/**
 * POST /api/push/subscribe — enregistre (ou rafraîchit) l'abonnement push de
 * l'appareil courant pour le user connecté.
 * Body = PushSubscription.toJSON() : { endpoint, keys: { p256dh, auth } }
 */
export async function POST(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const body = await req.json().catch(() => ({}))
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : ''
  const p256dh = body?.keys?.p256dh
  const auth = body?.keys?.auth
  if (!endpoint || typeof p256dh !== 'string' || typeof auth !== 'string') {
    return NextResponse.json({ error: 'Abonnement invalide' }, { status: 400 })
  }

  // Upsert par endpoint : si l'appareil se ré-abonne, on met à jour le user_id
  // et les clés (et on réattribue un endpoint « volé » à un autre compte).
  const { error } = await supabaseAdmin
    .from('push_subscriptions')
    .upsert({
      user_id:    ctx.userId,
      endpoint,
      p256dh,
      auth,
      user_agent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
      last_seen:  new Date().toISOString(),
    }, { onConflict: 'endpoint' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
