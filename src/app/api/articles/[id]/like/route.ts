import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser, notifyUser } from '@/lib/server-auth'

/**
 * POST — toggle like sur l'article (insert si pas like, delete sinon).
 * Notifie l'auteur de l'article au premier like (pas au unlike).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx
  const { id } = await params

  // Check si déjà liké
  const { data: existing } = await supabaseAdmin
    .from('article_likes')
    .select('article_id')
    .eq('article_id', id)
    .eq('user_id', ctx.userId)
    .maybeSingle()

  if (existing) {
    // Unlike
    await supabaseAdmin
      .from('article_likes')
      .delete()
      .eq('article_id', id)
      .eq('user_id', ctx.userId)
    return NextResponse.json({ liked: false })
  }

  // Like
  const { error } = await supabaseAdmin
    .from('article_likes')
    .insert({ article_id: id, user_id: ctx.userId })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notif à l'auteur (pas si l'auteur se like lui-même)
  const { data: article } = await supabaseAdmin
    .from('articles_journal')
    .select('user_id, titre')
    .eq('id', id)
    .maybeSingle()
  if (article?.user_id && article.user_id !== ctx.userId) {
    await notifyUser(article.user_id, {
      type: 'article_like',
      actor_name: 'Un lecteur',
      target_type: 'article',
      target_id: id,
    })
  }

  return NextResponse.json({ liked: true })
}

/**
 * GET — count + a-t-on liké
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  let userId: string | null = null
  if (token) {
    const { data: { user } } = await supabaseAdmin.auth.getUser(token)
    userId = user?.id ?? null
  }

  const [{ count }, mine] = await Promise.all([
    supabaseAdmin
      .from('article_likes')
      .select('article_id', { count: 'exact', head: true })
      .eq('article_id', id),
    userId
      ? supabaseAdmin
          .from('article_likes')
          .select('article_id')
          .eq('article_id', id)
          .eq('user_id', userId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  return NextResponse.json({
    count: count ?? 0,
    liked: !!mine?.data,
  })
}
