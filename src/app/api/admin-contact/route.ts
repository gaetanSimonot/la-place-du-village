import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser, notifyAdmins } from '@/lib/server-auth'

/**
 * Envoie un message in-app du user vers les admins.
 * Stocke dans commerce_requests avec type_commerce='admin_contact' pour
 * réutiliser l'infra existante (DemandesAdmin liste, traite, etc.).
 *
 * Body : { subject?: string, message: string }
 */
export async function POST(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { subject, message } = await req.json()
  if (!message?.trim()) {
    return NextResponse.json({ error: 'Message requis' }, { status: 400 })
  }

  const cleanSubject = (subject || 'Demande exceptionnelle').toString().slice(0, 200)
  const cleanMessage = message.toString().slice(0, 2000)

  const { error } = await supabaseAdmin
    .from('commerce_requests')
    .insert({
      nom: cleanSubject,
      type_commerce: 'admin_contact',
      message: cleanMessage,
      contact: ctx.email,
      user_id: ctx.userId,
      traite: false,
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await notifyAdmins({
    type: 'claim_pending',
    actor_name: `📩 ${ctx.email ?? 'user'}: ${cleanSubject.slice(0, 50)}`,
    target_type: 'claim',
  })

  return NextResponse.json({ success: true })
}
