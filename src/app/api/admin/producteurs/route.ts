import { NextRequest, NextResponse } from 'next/server'
import { territoireDeLaRequete } from '@/lib/territoires'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/server-auth'

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const { data, error } = await supabaseAdmin
    .from('producers')
    .select('*, products(*)')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ producers: data })
}

export async function POST(req: NextRequest) {
  /* Le territoire depuis lequel on cree. Sans lui la fiche serait invisible
     PARTOUT : toutes les lectures de l'annuaire filtrent desormais. */
  const terrCreation = await territoireDeLaRequete(req.url)
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

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
      ...(terrCreation ? { territoire_id: terrCreation.id } : {}),
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
