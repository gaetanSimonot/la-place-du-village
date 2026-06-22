import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'
import type { MomentCommentaire } from '@/lib/moments'

/**
 * GET /api/moments/[id]/commentaires — liste les commentaires (anciens d'abord).
 * POST — ajoute un commentaire (tout user connecté).
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await supabaseAdmin
    .from('moment_commentaires')
    .select('id, auteur_nom, texte, created_at')
    .eq('moment_id', params.id)
    .order('created_at', { ascending: true })
    .limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ commentaires: (data ?? []) as MomentCommentaire[] })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const body = await req.json().catch(() => ({}))
  const texte = String(body.texte ?? '').trim().slice(0, 500)
  if (!texte) return NextResponse.json({ error: 'Commentaire vide' }, { status: 400 })

  const { data: prof } = await supabaseAdmin
    .from('profiles').select('display_name').eq('user_id', ctx.userId).maybeSingle()

  const { data, error } = await supabaseAdmin
    .from('moment_commentaires')
    .insert({ moment_id: params.id, auteur_id: ctx.userId, auteur_nom: prof?.display_name ?? null, texte })
    .select('id, auteur_nom, texte, created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ commentaire: data as MomentCommentaire })
}
