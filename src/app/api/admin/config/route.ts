import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function PATCH(req: NextRequest) {
  const { key, value } = await req.json()
  const { error } = await supabaseAdmin
    .from('config')
    .upsert({ key, value: String(value) }, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
