import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data, error } = await supabaseAdmin
    .from('etablissements')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Non trouvé' }, { status: 404 })
  return NextResponse.json({ etablissement: data })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: etab } = await supabaseAdmin
    .from('etablissements')
    .select('user_id')
    .eq('id', id)
    .maybeSingle()

  if (!etab) return NextResponse.json({ error: 'Non trouvé' }, { status: 404 })
  if (etab.user_id !== user.id) return NextResponse.json({ error: 'Interdit' }, { status: 403 })

  const body = await req.json()
  const allowed = ['description_courte', 'description_longue', 'contact_tel', 'contact_whatsapp', 'site_web', 'horaires', 'photos']
  const patch = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)))

  const { error } = await supabaseAdmin.from('etablissements').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
