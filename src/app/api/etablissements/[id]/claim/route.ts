import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser, notifyAdmins } from '@/lib/server-auth'
import { can } from '@/lib/capabilities'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  if (!can(ctx, 'claim_etablissement')) {
    return NextResponse.json(
      { error: 'Revendiquer une fiche nécessite un abonnement Pro ou Max' },
      { status: 403 },
    )
  }

  const body = await req.json()
  const { contact, message } = body

  const { data: etab } = await supabaseAdmin
    .from('etablissements')
    .select('nom, user_id')
    .eq('id', id)
    .maybeSingle()

  if (!etab) return NextResponse.json({ error: 'Non trouvé' }, { status: 404 })
  if (etab.user_id) return NextResponse.json({ error: 'Déjà revendiqué' }, { status: 409 })

  const { error } = await supabaseAdmin.from('commerce_requests').insert({
    nom: etab.nom,
    type_commerce: 'claim',
    contact: contact ?? null,
    message: message ?? null,
    etablissement_id: id,
    user_id: ctx.userId,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await notifyAdmins({
    type: 'nouveau_produit',
    actor_name: `Claim: ${etab.nom}`,
    target_type: 'producer',
  })

  return NextResponse.json({ success: true })
}
