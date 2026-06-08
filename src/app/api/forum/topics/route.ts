import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'
import { sanitizeMedia } from '@/lib/postMedia'
import { sanitizePoll } from '@/lib/forum'

/** POST — créer un sujet (tout user connecté, gratuit inclus). */
export async function POST(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const body = await req.json().catch(() => ({}))
  const titre = typeof body?.titre === 'string' ? body.titre.trim() : ''
  if (titre.length < 1 || titre.length > 200) {
    return NextResponse.json({ error: 'Titre requis (1 à 200 caractères)' }, { status: 400 })
  }
  const corps = typeof body?.corps === 'string' ? (body.corps.trim().slice(0, 5000) || null) : null
  const media = sanitizeMedia(body?.media)
  const poll  = sanitizePoll(body?.poll)

  const { data, error } = await supabaseAdmin
    .from('forum_topics')
    .insert({
      user_id: ctx.userId,
      titre,
      corps,
      media: media.length ? media : null,
      poll,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: data.id }, { status: 201 })
}
