import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')

  let query = supabaseAdmin
    .from('etablissements')
    .select('id, type, nom, commune, lat, lng, photos, note_google, is_featured, statut, description_courte')
    .in('statut', ['publie', 'actif'])
    .order('is_featured', { ascending: false })
    .order('nom')

  if (type) query = query.eq('type', type)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ etablissements: data ?? [] })
}
