import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

// Route publique — lecture seule de la config zone pour le filtrage et la carte
export async function GET() {
  const [centresRes, affichageRes, latRes, lngRes, zoomRes] = await Promise.all([
    supabaseAdmin.from('zone_centres').select('id, nom, lat, lng'),
    supabaseAdmin.from('config').select('value').eq('key', 'rayon_affichage_km').single(),
    supabaseAdmin.from('config').select('value').eq('key', 'carte_depart_lat').single(),
    supabaseAdmin.from('config').select('value').eq('key', 'carte_depart_lng').single(),
    supabaseAdmin.from('config').select('value').eq('key', 'carte_depart_zoom').single(),
  ])

  return NextResponse.json({
    centres:           centresRes.data ?? [],
    rayon_affichage:   parseInt(affichageRes.data?.value ?? '0',  10),
    carte_depart_lat:  parseFloat(latRes.data?.value  ?? '43.5785'),
    carte_depart_lng:  parseFloat(lngRes.data?.value  ?? '3.8940'),
    carte_depart_zoom: parseInt(zoomRes.data?.value   ?? '11', 10),
  })
}
