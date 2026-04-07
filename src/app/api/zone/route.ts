import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// Route publique — lecture seule de la config zone pour le filtrage côté client
export async function GET() {
  const [centresRes, affichageRes] = await Promise.all([
    supabaseAdmin.from('zone_centres').select('id, nom, lat, lng'),
    supabaseAdmin.from('config').select('value').eq('key', 'rayon_affichage_km').single(),
  ])

  return NextResponse.json({
    centres:         centresRes.data ?? [],
    rayon_affichage: parseInt(affichageRes.data?.value ?? '0', 10),
  })
}
