import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function verifyAdmin(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user?.email) return null
  const { data } = await supabaseAdmin.from('admin_emails').select('email').eq('email', user.email).single()
  return data ? user.email : null
}

export async function GET(req: NextRequest) {
  if (!await verifyAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('producers')
    .select('*, products(*)')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ producers: data })
}

export async function POST(req: NextRequest) {
  if (!await verifyAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  // Résolution user_id depuis l'email
  let user_id: string | null = null
  if (body.user_email) {
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
    const found = users?.find(u => u.email === body.user_email)
    if (found) user_id = found.id
  }

  const { data, error } = await supabaseAdmin
    .from('producers')
    .insert({
      user_id,
      nom: body.nom,
      description_courte: body.description_courte || null,
      description_longue: body.description_longue || null,
      commune: body.commune || null,
      adresse: body.adresse || null,
      lat: body.lat || null,
      lng: body.lng || null,
      contact_whatsapp: body.contact_whatsapp || null,
      contact_tel: body.contact_tel || null,
      photos: body.photos || [],
      is_max: body.is_max || false,
    })
    .select('*, products(*)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ producer: data })
}
