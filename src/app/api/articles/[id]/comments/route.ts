import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser, notifyUser } from '@/lib/server-auth'

/**
 * GET — liste les commentaires de l'article + profil auteur de chaque comment.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data, error } = await supabaseAdmin
    .from('article_comments')
    .select('id, user_id, parent_id, content, created_at, updated_at')
    .eq('article_id', id)
    .order('created_at', { ascending: true })
    .limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const userIds = Array.from(new Set((data ?? []).map(c => c.user_id).filter(Boolean) as string[]))
  let profiles: Record<string, { display_name: string | null; avatar_url: string | null }> = {}
  if (userIds.length > 0) {
    const { data: profs } = await supabaseAdmin
      .from('profiles')
      .select('user_id, display_name, avatar_url')
      .in('user_id', userIds)
    profiles = Object.fromEntries(((profs ?? []) as { user_id: string; display_name: string | null; avatar_url: string | null }[]).map(p => [p.user_id, { display_name: p.display_name, avatar_url: p.avatar_url }]))
  }

  const comments = (data ?? []).map(c => ({
    ...c,
    profile: c.user_id ? profiles[c.user_id] ?? null : null,
  }))

  return NextResponse.json({ comments })
}

/**
 * POST — crée un commentaire (authenticated). Notifie l'auteur de l'article.
 * body : { content: string, parent_id?: string | null }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx
  const { id } = await params

  const body = await req.json().catch(() => ({}))
  const content = (body?.content ?? '').trim()
  const parent_id = body?.parent_id ?? null
  if (!content) return NextResponse.json({ error: 'Le commentaire est vide' }, { status: 400 })
  if (content.length > 2000) return NextResponse.json({ error: 'Trop long (2000 max)' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('article_comments')
    .insert({ article_id: id, user_id: ctx.userId, parent_id, content })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notif à l'auteur (sauf self-comment)
  const { data: article } = await supabaseAdmin
    .from('articles_journal')
    .select('user_id')
    .eq('id', id)
    .maybeSingle()
  if (article?.user_id && article.user_id !== ctx.userId) {
    // Récupère display_name pour personnaliser
    const { data: prof } = await supabaseAdmin
      .from('profiles')
      .select('display_name')
      .eq('user_id', ctx.userId)
      .maybeSingle()
    await notifyUser(article.user_id, {
      type: 'article_comment',
      actor_name: prof?.display_name ?? 'Un lecteur',
      target_type: 'article',
      target_id: id,
    })
  }

  return NextResponse.json({ comment: data })
}
