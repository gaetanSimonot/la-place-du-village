import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/server-auth'
import { dateParis } from '@/lib/cinema'

/**
 * Ménage des événements passés.
 *
 *  - PUBLIÉS : gardés UN AN après leur fin. Leur fiche reste en ligne — le
 *    lien trouvé sur Google affiche « a eu lieu » et renvoie vers l'à-venir
 *    de la commune au lieu d'une page morte. Toutes les listes publiques les
 *    écartent par `filtrePasTermine` (lib/cinema).
 *  - JAMAIS PUBLIÉS (en attente, refusés…) : supprimés 2 jours après, comme
 *    avant — ils n'ont pas de fiche publique et gonfleraient la file admin.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const cutoffStr = dateParis(-2)
  const cutoffPublieStr = dateParis(-365)
  const cutoff7Str = dateParis(-7)

  try {
    // Supprime les doublons archivés des soumissions user après 7 jours
    await supabaseAdmin
      .from('evenements')
      .delete()
      .eq('statut', 'archive')
      .not('submitted_by', 'is', null)
      .lt('created_at', cutoff7Str + 'T00:00:00')

    // Récupère les événements trop vieux : non publiés passés de 2 jours,
    // publiés passés d'un an.
    const termineAvant = (d: string) => `date_fin.lt.${d},and(date_fin.is.null,date_debut.lt.${d})`
    const [{ data: nonPublies }, { data: publies }] = await Promise.all([
      supabaseAdmin.from('evenements').select('id, lieu_id')
        .neq('statut', 'publie').or(termineAvant(cutoffStr)),
      supabaseAdmin.from('evenements').select('id, lieu_id')
        .eq('statut', 'publie').or(termineAvant(cutoffPublieStr)),
    ])
    const oldEvents = [...(nonPublies ?? []), ...(publies ?? [])]

    if (oldEvents.length === 0) {
      return NextResponse.json({ deleted: 0 })
    }

    const ids = oldEvents.map(e => e.id)

    // Supprime les événements
    const { error } = await supabaseAdmin.from('evenements').delete().in('id', ids)
    if (error) throw new Error(error.message)

    // Nettoie les lieux orphelins
    const lieuIds = Array.from(new Set(oldEvents.map(e => e.lieu_id).filter(Boolean)))
    for (const lieuId of lieuIds) {
      const { count } = await supabaseAdmin
        .from('evenements')
        .select('id', { count: 'exact', head: true })
        .eq('lieu_id', lieuId)
      if (count === 0) {
        await supabaseAdmin.from('lieux').delete().eq('id', lieuId)
      }
    }

    return NextResponse.json({ deleted: ids.length })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur' }, { status: 500 })
  }
}
