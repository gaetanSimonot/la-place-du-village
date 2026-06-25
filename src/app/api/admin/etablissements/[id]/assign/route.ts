import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin, notifyUser } from '@/lib/server-auth'

/**
 * POST /api/admin/etablissements/[id]/assign  { user_id }
 *
 * Admin attribue une fiche établissement à un utilisateur : il en obtient la
 * GESTION, avec les avantages de SON plan (la fiche hérite du plan du user).
 * Permet à un user de gérer plusieurs fiches sans surcoût (décision admin).
 * Même effet que la revendication, mais sans quota et sans capability check
 * côté user — l'admin décide.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const { user_id } = await req.json().catch(() => ({}))
  if (!user_id) return NextResponse.json({ error: 'user_id requis' }, { status: 400 })

  const { data: etab } = await supabaseAdmin
    .from('etablissements').select('nom, user_id').eq('id', id).maybeSingle()
  if (!etab) return NextResponse.json({ error: 'Fiche introuvable' }, { status: 404 })

  // Plan du user cible → la fiche en hérite (avantages pro si pro).
  const { data: prof } = await supabaseAdmin
    .from('profiles').select('plan').eq('user_id', user_id).maybeSingle()
  const plan = (prof?.plan as string) ?? 'basic'

  const { error: upErr } = await supabaseAdmin
    .from('etablissements')
    .update({ user_id, plan, is_featured: plan === 'pro' })
    .eq('id', id)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  // Transfert des promos orphelines de la fiche au nouveau gestionnaire
  // (sinon elles resteraient invisibles publiquement). Fail-silent.
  await supabaseAdmin
    .from('promotions').update({ user_id }).eq('etablissement_id', id).neq('user_id', user_id)

  // Notif au user : il a reçu la gestion de la fiche.
  await notifyUser(user_id, {
    type: 'claim_approved',
    actor_name: etab.nom,
    target_type: 'etablissement',
    target_id: id,
  })

  return NextResponse.json({ success: true })
}
