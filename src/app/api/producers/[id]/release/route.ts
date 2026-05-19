import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser, notifyAdmins } from '@/lib/server-auth'

/**
 * Le user proprio (ou un admin) renonce à la gestion d'une fiche producteur.
 *
 * Effet :
 *  - producers.user_id passe à NULL
 *  - is_featured passe à false
 *  - notif aux admins pour info
 *
 * Note : ne cancel PAS un éventuel abonnement Stripe lié.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { data: prod } = await supabaseAdmin
    .from('producers')
    .select('user_id, nom')
    .eq('id', id)
    .maybeSingle()

  if (!prod) return NextResponse.json({ error: 'Non trouvé' }, { status: 404 })

  // Seuls le proprio ou un admin peuvent relâcher
  if (!ctx.isAdmin && prod.user_id !== ctx.userId) {
    return NextResponse.json({ error: 'Vous n\'êtes pas le propriétaire' }, { status: 403 })
  }

  const { error } = await supabaseAdmin
    .from('producers')
    .update({ user_id: null })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await notifyAdmins({
    type: 'claim_pending',
    actor_name: `Libérée: ${prod.nom}`,
    target_type: 'producer',
    target_id: id,
  })

  return NextResponse.json({ success: true })
}
