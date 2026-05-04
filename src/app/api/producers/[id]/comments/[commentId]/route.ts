import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function verifyUser(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  return user ?? null
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ commentId: string }> }) {
  const { commentId } = await params
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: comment } = await supabaseAdmin
    .from('producer_comments').select('user_id').eq('id', commentId).maybeSingle()
  if (!comment || comment.user_id !== user.id)
    return NextResponse.json({ error: 'Interdit' }, { status: 403 })

  const { content } = await req.json()
  if (!content?.trim()) return NextResponse.json({ error: 'Contenu vide' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('producer_comments').update({ content: content.trim() }).eq('id', commentId)
    .select('id, content').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ commentId: string }> }) {
  const { commentId } = await params
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: comment } = await supabaseAdmin
    .from('producer_comments').select('user_id').eq('id', commentId).maybeSingle()
  if (!comment || comment.user_id !== user.id)
    return NextResponse.json({ error: 'Interdit' }, { status: 403 })

  const { error } = await supabaseAdmin.from('producer_comments').delete().eq('id', commentId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
