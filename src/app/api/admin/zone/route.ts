import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { geocodeWithGoogle } from '@/lib/extract'

export async function GET() {
  const [centresRes, rayonRes] = await Promise.all([
    supabaseAdmin.from('zone_centres').select('*').order('created_at'),
    supabaseAdmin.from('config').select('value').eq('key', 'rayon_km').single(),
  ])
  return NextResponse.json({
    centres: centresRes.data ?? [],
    rayon:   parseInt(rayonRes.data?.value ?? '30', 10),
  })
}

export async function POST(req: NextRequest) {
  const { nom } = await req.json()
  if (!nom?.trim()) return NextResponse.json({ error: 'Nom requis' }, { status: 400 })

  // Géocoder le village
  const geo = await geocodeWithGoogle(nom, null)
  if (!geo.lat || !geo.lng) {
    return NextResponse.json({ error: `Village introuvable : ${nom}` }, { status: 404 })
  }

  const { data, error } = await supabaseAdmin
    .from('zone_centres')
    .insert({ nom: nom.trim(), lat: geo.lat, lng: geo.lng })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { rayon } = await req.json()
  if (!rayon || rayon < 5 || rayon > 200) {
    return NextResponse.json({ error: 'Rayon invalide (5–200 km)' }, { status: 400 })
  }
  await supabaseAdmin
    .from('config')
    .upsert({ key: 'rayon_km', value: String(rayon) }, { onConflict: 'key' })
  return NextResponse.json({ ok: true })
}
