import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

/**
 * GET — liste les actus/posts actifs d'un établissement (public).
 *   ?etab=<id> requis.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const etabId = searchParams.get('etab')
  if (!etabId) return NextResponse.json({ error: 'etab requis' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('etablissement_posts')
    .select('*')
    .eq('etablissement_id', etabId)
    .eq('active', true)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ posts: data ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } })
}

/**
 * POST — crée une actu (propriétaire de la fiche, ou admin).
 * Body : { etablissement_id, type?: 'actu'|'autre', titre?, contenu, image_url?, image_position? }
 */
export async function POST(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const body = await req.json()
  const { etablissement_id, type, titre, contenu, image_url, image_position } = body

  if (!etablissement_id || !contenu?.trim()) {
    return NextResponse.json({ error: 'etablissement_id et contenu requis' }, { status: 400 })
  }

  const { data: etab } = await supabaseAdmin
    .from('etablissements').select('user_id').eq('id', etablissement_id).maybeSingle()
  if (!etab) return NextResponse.json({ error: 'Établissement introuvable' }, { status: 404 })
  if (etab.user_id !== ctx.userId && !ctx.isAdmin) {
    return NextResponse.json({ error: 'Vous ne gérez pas cet établissement' }, { status: 403 })
  }

  const cleanType = type === 'autre' ? 'autre' : 'actu'

  const { data, error } = await supabaseAdmin
    .from('etablissement_posts')
    .insert({
      etablissement_id,
      user_id: ctx.userId,
      type: cleanType,
      titre: titre?.trim() || null,
      contenu: contenu.trim(),
      image_url: image_url || null,
      image_position: image_position || '50% 50%',
      active: true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ post: data })
}
