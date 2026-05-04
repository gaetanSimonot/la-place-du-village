import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function verifyUser(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  return user ?? null
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data: raw } = await supabaseAdmin
    .from('producer_comments')
    .select('id, user_id, content, parent_id, created_at')
    .eq('producer_id', id)
    .order('created_at', { ascending: true })

  if (!raw || raw.length === 0) return NextResponse.json({ comments: [] })

  const uids = Array.from(new Set(raw.map((c: { user_id: string }) => c.user_id)))
  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('user_id, display_name, avatar_url')
    .in('user_id', uids)

  const pmap = Object.fromEntries(
    ((profiles ?? []) as { user_id: string; display_name: string | null; avatar_url: string | null }[])
      .map(p => [p.user_id, p])
  )
  const comments = raw.map((c: { id: string; user_id: string; content: string; parent_id: string | null; created_at: string }) => ({
    ...c,
    profile: pmap[c.user_id] ?? null,
  }))
  return NextResponse.json({ comments })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { content } = await req.json()
  if (!content?.trim()) return NextResponse.json({ error: 'Contenu vide' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('producer_comments')
    .insert({ producer_id: id, user_id: user.id, content: content.trim(), parent_id: null })
    .select('id, user_id, content, parent_id, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('user_id, display_name, avatar_url')
    .eq('user_id', user.id)
    .maybeSingle()

  return NextResponse.json({ comment: { ...data, profile: profile ?? null } })
}
