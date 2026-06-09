import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

/** Vérifie que le user connecté gère la fiche du post (ou est admin). */
async function ownsPost(id: string, ctx: { userId: string; isAdmin: boolean }) {
  // Deux requêtes séparées : les jointures implicites PostgREST échouent
  // silencieusement (cf. règle projet).
  const { data: post } = await supabaseAdmin
    .from('etablissement_posts').select('etablissement_id').eq('id', id).maybeSingle()
  if (!post) return { ok: false as const, status: 404, error: 'Non trouvé' }
  const { data: etab } = await supabaseAdmin
    .from('etablissements').select('user_id').eq('id', post.etablissement_id).maybeSingle()
  if (etab?.user_id !== ctx.userId && !ctx.isAdmin) {
    return { ok: false as const, status: 403, error: 'Interdit' }
  }
  return { ok: true as const }
}

/** PATCH — modifie une actu (propriétaire/admin). Champs : titre, contenu, image_url, image_position, active. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const owns = await ownsPost(id, ctx)
  if (!owns.ok) return NextResponse.json({ error: owns.error }, { status: owns.status })

  const body = await req.json()
  const allowed = ['titre', 'contenu', 'image_url', 'image_position', 'active']
  const patch: Record<string, unknown> = {}
  for (const k of allowed) {
    if (k in body) patch[k] = body[k] === '' ? null : body[k]
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Rien à modifier' }, { status: 400 })

  const { error } = await supabaseAdmin.from('etablissement_posts').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

/** DELETE — supprime une actu (propriétaire/admin). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const owns = await ownsPost(id, ctx)
  if (!owns.ok) return NextResponse.json({ error: owns.error }, { status: owns.status })

  const { error } = await supabaseAdmin.from('etablissement_posts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
