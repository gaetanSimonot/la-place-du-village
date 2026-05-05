import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { geocodeWithGoogle } from '@/lib/extract'

export async function GET() {
  const [centresRes, insertionRes, affichageRes, latRes, lngRes, zoomRes] = await Promise.all([
    supabaseAdmin.from('zone_centres').select('*').order('created_at'),
    supabaseAdmin.from('config').select('value').eq('key', 'rayon_insertion_km').single(),
    supabaseAdmin.from('config').select('value').eq('key', 'rayon_affichage_km').single(),
    supabaseAdmin.from('config').select('value').eq('key', 'carte_depart_lat').single(),
    supabaseAdmin.from('config').select('value').eq('key', 'carte_depart_lng').single(),
    supabaseAdmin.from('config').select('value').eq('key', 'carte_depart_zoom').single(),
  ])
  return NextResponse.json({
    centres:           centresRes.data ?? [],
    rayon_insertion:   parseInt(insertionRes.data?.value  ?? '100', 10),
    rayon_affichage:   parseInt(affichageRes.data?.value  ?? '50',  10),
    carte_depart_lat:  parseFloat(latRes.data?.value  ?? '43.5785'),
    carte_depart_lng:  parseFloat(lngRes.data?.value  ?? '3.8940'),
    carte_depart_zoom: parseInt(zoomRes.data?.value   ?? '11', 10),
  })
}

export async function POST(req: NextRequest) {
  const { nom } = await req.json()
  if (!nom?.trim()) return NextResponse.json({ error: 'Nom requis' }, { status: 400 })

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
  const { rayon_insertion, rayon_affichage, carte_depart_lat, carte_depart_lng, carte_depart_zoom } = await req.json()

  const upserts = []
  if (rayon_insertion != null)    upserts.push(supabaseAdmin.from('config').upsert({ key: 'rayon_insertion_km', value: String(rayon_insertion) },  { onConflict: 'key' }))
  if (rayon_affichage != null)    upserts.push(supabaseAdmin.from('config').upsert({ key: 'rayon_affichage_km', value: String(rayon_affichage) },  { onConflict: 'key' }))
  if (carte_depart_lat  != null)  upserts.push(supabaseAdmin.from('config').upsert({ key: 'carte_depart_lat',  value: String(carte_depart_lat) },  { onConflict: 'key' }))
  if (carte_depart_lng  != null)  upserts.push(supabaseAdmin.from('config').upsert({ key: 'carte_depart_lng',  value: String(carte_depart_lng) },  { onConflict: 'key' }))
  if (carte_depart_zoom != null)  upserts.push(supabaseAdmin.from('config').upsert({ key: 'carte_depart_zoom', value: String(carte_depart_zoom) }, { onConflict: 'key' }))

  await Promise.all(upserts)
  return NextResponse.json({ ok: true })
}
