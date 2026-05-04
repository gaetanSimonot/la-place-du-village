import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function verifyUser(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  return user ?? null
}

export async function GET(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('plan, pro_type')
    .eq('user_id', user.id)
    .maybeSingle()

  const plan = profile?.plan ?? 'basic'
  const pro_type = profile?.pro_type ?? null

  if (plan !== 'max') return NextResponse.json({ plan, pro_type, producer: null, products: [] })

  const { data: producer } = await supabaseAdmin
    .from('producers')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!producer) return NextResponse.json({ plan, pro_type, producer: null, products: [] })

  const { data: products } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('producer_id', producer.id)
    .order('created_at', { ascending: false })

  return NextResponse.json({ plan, pro_type, producer, products: products ?? [] })
}

export async function POST(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabaseAdmin
    .from('profiles').select('plan').eq('user_id', user.id).maybeSingle()

  if (profile?.plan !== 'max') return NextResponse.json({ error: 'Plan MAX requis' }, { status: 403 })

  const { data: existing } = await supabaseAdmin
    .from('producers').select('id').eq('user_id', user.id).maybeSingle()
  if (existing) return NextResponse.json({ error: 'Fiche déjà existante' }, { status: 409 })

  const body = await req.json()
  const { nom, description_courte, description_longue, commune, adresse, lat, lng,
          contact_tel, contact_whatsapp, site_web, photos, pro_type } = body

  const { data, error } = await supabaseAdmin
    .from('producers')
    .insert({
      user_id: user.id,
      nom,
      description_courte: description_courte || null,
      description_longue: description_longue || null,
      commune: commune || null,
      adresse: adresse || null,
      lat: lat || null,
      lng: lng || null,
      contact_tel: contact_tel || null,
      contact_whatsapp: contact_whatsapp || null,
      site_web: site_web || null,
      photos: photos ?? [],
      is_max: true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (pro_type) {
    await supabaseAdmin.from('profiles').update({ pro_type }).eq('user_id', user.id)
  }

  return NextResponse.json({ producer: data })
}

export async function PATCH(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: producer } = await supabaseAdmin
    .from('producers').select('id').eq('user_id', user.id).maybeSingle()
  if (!producer) return NextResponse.json({ error: 'Fiche non trouvée' }, { status: 404 })

  const body = await req.json()
  const fields = ['nom', 'description_courte', 'description_longue', 'commune', 'adresse',
    'lat', 'lng', 'contact_tel', 'contact_whatsapp', 'site_web', 'photos', 'vente_directe', 'retrait_sur_place']

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  fields.forEach(f => { if (f in body) update[f] = body[f] === '' ? null : body[f] })

  const { data, error } = await supabaseAdmin
    .from('producers').update(update).eq('id', producer.id).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if ('pro_type' in body) {
    await supabaseAdmin.from('profiles').update({ pro_type: body.pro_type || null }).eq('user_id', user.id)
  }

  return NextResponse.json({ producer: data })
}
