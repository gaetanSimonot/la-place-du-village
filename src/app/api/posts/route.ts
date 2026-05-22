import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

const VISIBILITY = ['public', 'amis', 'prive'] as const
type Visibility = (typeof VISIBILITY)[number]

const MAX_LEN = 2000

/**
 * Création d'un post sur le mur de l'utilisateur authentifié.
 *
 * Sécurité :
 * - requireUser : scope auth.uid()
 * - user_id forcé à ctx.userId (pas accepté en body) → impossible de
 *   poster sur le mur de quelqu'un d'autre
 * - Validation texte 1..2000 chars + visibility whitelist
 */
export async function POST(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const body = await req.json().catch(() => ({}))
  const { texte, visibility } = body as { texte?: unknown; visibility?: unknown }

  if (typeof texte !== 'string') {
    return NextResponse.json({ error: 'Texte requis' }, { status: 400 })
  }
  const trimmed = texte.trim()
  if (trimmed.length === 0) {
    return NextResponse.json({ error: 'Texte vide' }, { status: 400 })
  }
  if (trimmed.length > MAX_LEN) {
    return NextResponse.json({ error: `Texte trop long (max ${MAX_LEN})` }, { status: 400 })
  }

  let vis: Visibility = 'public'
  if (typeof visibility === 'string' && (VISIBILITY as readonly string[]).includes(visibility)) {
    vis = visibility as Visibility
  }

  const { data, error } = await supabaseAdmin
    .from('posts')
    .insert({ user_id: ctx.userId, texte: trimmed, visibility: vis })
    .select('id, user_id, texte, visibility, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ post: data }, { status: 201 })
}
