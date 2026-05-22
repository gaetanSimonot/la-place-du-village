import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/server-auth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const { data, error } = await supabaseAdmin
    .from('sources')
    .select('*, scrape_logs(id, created_at, trouves, doublons, inseres, erreur)')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sources: data })
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const { nom, url, frequence = '24h' } = await req.json()
  if (!nom?.trim() || !url?.trim())
    return NextResponse.json({ error: 'nom et url requis' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('sources')
    .insert({ nom: nom.trim(), url: url.trim(), frequence })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ source: data })
}
