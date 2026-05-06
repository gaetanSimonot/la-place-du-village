import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await req.json()
  const { contact, message } = body

  const { data: etab } = await supabaseAdmin
    .from('etablissements')
    .select('nom, user_id')
    .eq('id', id)
    .maybeSingle()

  if (!etab) return NextResponse.json({ error: 'Non trouvé' }, { status: 404 })
  if (etab.user_id) return NextResponse.json({ error: 'Déjà revendiqué' }, { status: 409 })

  const { error } = await supabaseAdmin.from('commerce_requests').insert({
    nom: etab.nom,
    type_commerce: 'claim',
    contact: contact ?? null,
    message: message ?? null,
    etablissement_id: id,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notification admin
  const { data: adminProfile } = await supabaseAdmin
    .from('profiles')
    .select('user_id')
    .eq('email', 'gaetan.simonot@gmail.com')
    .maybeSingle()

  if (adminProfile?.user_id) {
    await supabaseAdmin.from('notifications').insert({
      user_id: adminProfile.user_id,
      type: 'nouveau_produit',
      actor_name: `Claim: ${etab.nom}`,
      target_type: 'producer',
      lu: false,
    })
  }

  return NextResponse.json({ success: true })
}
