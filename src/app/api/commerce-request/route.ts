import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { nom, type, commune, contact, message } = body
  if (!nom?.trim()) return NextResponse.json({ error: 'Nom requis' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('commerce_requests')
    .insert({ nom: nom.trim(), type_commerce: type || null, commune: commune || null, contact: contact || null, message: message || null })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notification in-app pour l'admin
  const { data: adminProfile } = await supabaseAdmin
    .from('profiles')
    .select('user_id')
    .eq('email', 'gaetan.simonot@gmail.com')
    .maybeSingle()

  if (adminProfile?.user_id) {
    await supabaseAdmin.from('notifications').insert({
      user_id: adminProfile.user_id,
      type: 'nouveau_produit',
      actor_name: nom.trim(),
      target_type: 'producer',
      lu: false,
    })
  }

  return NextResponse.json({ success: true })
}
