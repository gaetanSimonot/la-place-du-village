import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

export async function PATCH(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { display_name } = await req.json()
  if (!display_name?.trim()) return NextResponse.json({ error: 'Nom invalide' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ display_name: display_name.trim() })
    .eq('user_id', ctx.userId)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ profile: data })
}
