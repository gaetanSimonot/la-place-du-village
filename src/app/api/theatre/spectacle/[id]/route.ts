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

  /*
   * LES LIEUX DE JEU HORS LES MURS.
   *
   * Une saison de village ne se joue pas que dans la salle : « Garder » se
   * donne aux Belvédères de Blandas, « Pixel » à l'Opéra Berlioz. La fiche
   * affichait pourtant l'adresse du théâtre qui programme — elle envoyait
   * les gens à 40 km du spectacle.
   *
   * `representations.lieu` porte le nom exact écrit au programme. On le
   * rapproche de la table `lieux`, le registre des endroits de l'app, où ces
   * salles ont été géocodées une fois pour toutes. Rapprochement par NOM et
   * non par clé étrangère : si quelqu'un réécrit le libellé d'une date,
   * l'adresse disparaît — c'est la bonne panne. Une clé étrangère aurait
   * gardé l'ancienne adresse et menti.
   *
   * Un lieu sans correspondance — « Écoles du territoire », « Divers lieux »
   * — n'en a tout simplement pas : ce ne sont pas des adresses, et on n'en
   * inventera pas.
   */
  const nomsLieux = Array.from(new Set(
    (repRows ?? []).map(r => r.lieu).filter(Boolean) as string[]))
  const { data: lieuxRows } = nomsLieux.length
    ? await supabaseAdmin.from('lieux')
        .select('id, nom, adresse, commune, lat, lng')
        .in('nom', nomsLieux)
    : { data: [] }

  return NextResponse.json({
    spectacle: spRow as Spectacle,
    representations: (repRows ?? []) as Representation[],
    theatres,
    lieux: lieuxRows ?? [],
    aujourdhui: dateParis(),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
