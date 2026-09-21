import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { dateParis } from '@/lib/cinema'
import type { Spectacle, Representation } from '@/lib/theatre'
import { listerTheatres } from '@/lib/theatre-server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/theatre/spectacle/[id] — une fiche et toutes ses dates.
 *
 * Sans compte, comme le reste du module.
 *
 * Les dates PASSÉES sont renvoyées aussi, et c'est la différence avec le
 * cinéma : une séance d'hier n'intéresse personne, un spectacle déjà joué
 * si. On veut pouvoir ouvrir sa fiche et lire ce qui a été programmé.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const { data: spRow } = await supabaseAdmin
    .from('spectacles').select('*').eq('id', id).maybeSingle()
  if (!spRow) return NextResponse.json({ error: 'introuvable' }, { status: 404 })

  const { data: repRows } = await supabaseAdmin
    .from('representations')
    .select('id, etablissement_id, spectacle_id, date, heure, lieu, scolaire, billetterie_url, note')
    .eq('spectacle_id', id)
    .order('date')
    .order('heure')

  // Toutes les salles, pour nommer celle de chaque date : un spectacle peut
  // tourner, et la fiche doit dire OÙ.
  const theatres = await listerTheatres()

  return NextResponse.json({
    spectacle: spRow as Spectacle,
    representations: (repRows ?? []) as Representation[],
    theatres,
    aujourdhui: dateParis(),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
