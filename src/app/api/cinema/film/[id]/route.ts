import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { dateParis } from '@/lib/cinema'
import { listerCinemas } from '@/lib/cinema-server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/cinema/film/[id] — un film et ses séances à venir.
 *
 * Public, sans compte. Les séances ne sont retournées que pour les salles
 * ayant le module accordé : un film reste en base quand un cinéma perd le
 * module, ses séances ne doivent plus s'afficher pour autant.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: film } = await supabaseAdmin
    .from('films').select('*').eq('id', id).maybeSingle()
  if (!film) return NextResponse.json({ error: 'Film introuvable' }, { status: 404 })

  const cinemas = await listerCinemas()
  if (!cinemas.length) return NextResponse.json({ film, seances: [], cinemas: [] })

  const { data: seances } = await supabaseAdmin
    .from('seances')
    .select('id, etablissement_id, film_id, date, heure, version, salle, billetterie_url, note')
    .eq('film_id', id)
    .in('etablissement_id', cinemas.map(c => c.id))
    .gte('date', dateParis())
    .order('date').order('heure')

  return NextResponse.json({
    film,
    seances: seances ?? [],
    cinemas,
    aujourdhui: dateParis(),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
