import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/server-auth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const { data, error } = await supabaseAdmin
    .from('sources')
    .select('*, scrape_logs(id, created_at, trouves, doublons, inseres, erreur)')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sources: data })
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const {
    nom, url, frequence = '24h',
    type = 'evenements', rayon_km, horizon_jours, publier_auto, indice_geo,
  } = await req.json()

  if (!nom?.trim() || !url?.trim())
    return NextResponse.json({ error: 'nom et url requis' }, { status: 400 })
  if (type !== 'evenements' && type !== 'recurrent')
    return NextResponse.json({ error: 'type invalide' }, { status: 400 })

  // Bornes de bon sens : un rayon ou un horizon aberrant saisi par erreur ne
  // doit pas se traduire par 3 000 lignes en base.
  const rayon   = rayon_km      != null ? Math.min(300, Math.max(1, parseInt(String(rayon_km), 10)      || 0)) : null
  const horizon = horizon_jours != null ? Math.min(120, Math.max(7, parseInt(String(horizon_jours), 10) || 0)) : null

  const { data, error } = await supabaseAdmin
    .from('sources')
    .insert({
      nom: nom.trim(),
      url: url.trim(),
      frequence,
      type,
      rayon_km:      rayon || null,
      horizon_jours: horizon || null,
      publier_auto:  publier_auto === true,
      indice_geo:    typeof indice_geo === 'string' && indice_geo.trim() ? indice_geo.trim().slice(0, 80) : null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ source: data })
}
