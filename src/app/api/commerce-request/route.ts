import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { notifyAdmins } from '@/lib/server-auth'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { nom, type, commune, contact, message } = body
  if (!nom?.trim()) return NextResponse.json({ error: 'Nom requis' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('commerce_requests')
    .insert({ nom: nom.trim(), type_commerce: type || null, commune: commune || null, contact: contact || null, message: message || null })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await notifyAdmins({
    type: 'claim_pending',
    actor_name: nom.trim(),
    target_type: 'claim',
  })

  return NextResponse.json({ success: true })
}
