import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// Supprime les événements dont la date de fin (ou début) est passée depuis 2 jours
export async function POST() {
  const now = new Date()
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2)
  const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`

  try {
    // Récupère les événements trop vieux
    const { data: oldEvents } = await supabaseAdmin
      .from('evenements')
      .select('id, lieu_id, date_fin, date_debut')
      .or(`date_fin.lt.${cutoffStr},and(date_fin.is.null,date_debut.lt.${cutoffStr})`)

    if (!oldEvents || oldEvents.length === 0) {
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
