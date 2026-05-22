import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/server-auth'

export async function PATCH(req: NextRequest) {
  // Garde admin : la route utilise service_role (bypass RLS) → sans cette
  // garde, tout user connecté pouvait modifier la config globale.
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const { key, value } = await req.json()
  const { error } = await supabaseAdmin
    .from('config')
    .upsert({ key, value: String(value) }, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
