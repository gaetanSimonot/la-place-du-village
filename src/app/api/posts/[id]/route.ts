import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

/**
 * Suppression d'un post.
 *
 * Sécurité : un user peut supprimer SON post · un admin peut supprimer
 * n'importe quel post (modération).
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const postId = params.id

  // Charge le post pour vérifier ownership (admin override)
  const { data: post, error: fetchErr } = await supabaseAdmin
    .from('posts')
    .select('id, user_id')
    .eq('id', postId)
    .maybeSingle()

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }
  if (!post) {
    return NextResponse.json({ error: 'Post introuvable' }, { status: 404 })
  }
  if (post.user_id !== ctx.userId && !ctx.isAdmin) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const { error: delErr } = await supabaseAdmin.from('posts').delete().eq('id', postId)
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
