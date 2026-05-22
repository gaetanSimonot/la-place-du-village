import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

/**
 * GET /api/posts/mur?userId=<uuid> — payload regroupé pour MurTab.
 *
 * Reproduit la logique RLS posts SELECT côté serveur :
 *   - Si je regarde MON propre mur (userId === ctx.userId) → tous mes posts
 *     (public + amis + privé inclus).
 *   - Si je regarde le mur de quelqu'un d'autre :
 *     · posts visibility='public' (visibles par tous) +
 *     · posts visibility='amis' si on est amis acceptés (friendships).
 *     · jamais les posts 'private' d'un autre.
 *
 * Agrège dans 1 payload :
 *   - posts (visibles selon règle ci-dessus)
 *   - likeCount par post
 *   - commentCount par post
 *   - userHasLiked par post (depuis l'user appelant)
 *
 * PERSO → Cache-Control: private, no-store. Pas de CDN sharing.
 *
 * Pourquoi cette route plutôt que supabase.from('posts') côté client :
 *   - Évite le bug "load avant token prêt" → la route ne répond qu'avec un
 *     ctx authentifié validé serveur.
 *   - Permet un useSWR(key, authedFetcher) côté client : clé null tant que
 *     pas de token → pas de race.
 *   - 1 round-trip HTTP au lieu de 3 (posts + likes + comments).
 */

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')
  if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(userId)) {
    return NextResponse.json({ error: 'userId invalide' }, { status: 400 })
  }

  // ── Détermine quel filtre de visibilité appliquer ──
  const isOwnWall = userId === ctx.userId

  // ── Friendship check si on regarde le mur de quelqu'un d'autre ──
  let isFriend = false
  if (!isOwnWall) {
    const { data: f } = await supabaseAdmin
      .from('friendships')
      .select('id')
      .eq('status', 'accepted')
      .or(
        `and(user1_id.eq.${ctx.userId},user2_id.eq.${userId}),` +
        `and(user2_id.eq.${ctx.userId},user1_id.eq.${userId})`,
      )
      .limit(1)
      .maybeSingle()
    isFriend = !!f
  }

  // ── Fetch posts (filtre visibilité côté serveur) ──
  let postsQuery = supabaseAdmin
    .from('posts')
    .select('id, user_id, texte, visibility, embed_kind, embed_ref_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (!isOwnWall) {
    // Visiteur : seulement public, +amis si l'on est amis.
    if (isFriend) {
      postsQuery = postsQuery.in('visibility', ['public', 'amis'])
    } else {
      postsQuery = postsQuery.eq('visibility', 'public')
    }
  }
  // (isOwnWall : pas de filtre supplémentaire → tous les posts du user, y compris 'private')

  const { data: postsRows, error: postsErr } = await postsQuery
  if (postsErr) {
    return NextResponse.json({ error: postsErr.message }, { status: 500 })
  }

  const posts = (postsRows ?? []) as Array<{
    id: string; user_id: string; texte: string; visibility: string;
    embed_kind: string | null; embed_ref_id: string | null; created_at: string
  }>

  if (posts.length === 0) {
    return NextResponse.json({ posts: [] }, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  }

  // ── Aggrege likes + comments en parallèle (uniquement pour ces posts) ──
  const postIds = posts.map(p => p.id)
  const [likesRes, commentsRes] = await Promise.all([
    supabaseAdmin.from('post_likes').select('post_id, user_id').in('post_id', postIds),
    supabaseAdmin.from('post_comments').select('post_id').in('post_id', postIds),
  ])

  const likeCountByPost    = new Map<string, number>()
  const commentCountByPost = new Map<string, number>()
  const myLikedSet         = new Set<string>()
  for (const l of likesRes.data ?? []) {
    likeCountByPost.set(l.post_id, (likeCountByPost.get(l.post_id) ?? 0) + 1)
    if (l.user_id === ctx.userId) myLikedSet.add(l.post_id)
  }
  for (const c of commentsRes.data ?? []) {
    commentCountByPost.set(c.post_id, (commentCountByPost.get(c.post_id) ?? 0) + 1)
  }

  const enriched = posts.map(p => ({
    ...p,
    likeCount:    likeCountByPost.get(p.id) ?? 0,
    commentCount: commentCountByPost.get(p.id) ?? 0,
    userHasLiked: myLikedSet.has(p.id),
  }))

  return NextResponse.json({ posts: enriched }, {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
