import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser, notifyAdmins } from '@/lib/server-auth'

/**
 * Le user proprio (ou un admin) renonce a la gestion d'un etablissement.
 *
 * Effet :
 *  - etablissements.user_id passe a NULL
 *  - le plan etab reset a 'basic', is_featured = false
 *  - notif aux admins pour info
 *
 * Note : ne cancel PAS un eventuel abonnement Stripe lie a l'etab.
 * Le user doit aller dans son portail Stripe ('Gerer l'abonnement')
 * pour resilier. Phase D rebranchera ca plus proprement.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { data: etab } = await supabaseAdmin
    .from('etablissements')
    .select('user_id, nom')
    .eq('id', id)
    .maybeSingle()

  if (!etab) return NextResponse.json({ error: 'Non trouvé' }, { status: 404 })

  // Seuls le proprio ou un admin peuvent relacher
  if (!ctx.isAdmin && etab.user_id !== ctx.userId) {
    return NextResponse.json({ error: 'Vous n\'êtes pas le propriétaire' }, { status: 403 })
  }

  const { error } = await supabaseAdmin
    .from('etablissements')
    .update({ user_id: null, plan: 'basic', is_featured: false })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await notifyAdmins({
    type: 'claim_pending',
    actor_name: `Liberée: ${etab.nom}`,
    target_type: 'claim',
  })

  return NextResponse.json({ success: true })
}
