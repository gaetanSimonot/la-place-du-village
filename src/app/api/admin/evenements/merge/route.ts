import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/server-auth'
import { mergeCategories } from '@/lib/categories'
import { buildMergedEvent, type MergeInput } from '@/lib/mergeEvents'

/**
 * POST /api/admin/evenements/merge
 * Body : {
 *   ids: string[]            // ≥ 2 ; ids[0] = fiche principale conservée
 *   description?: string     // override (édité dans l'aperçu)
 *   categories?: string[]    // override (édité dans l'aperçu)
 * }
 *
 * Fusion DÉTERMINISTE (aucun appel LLM) via buildMergedEvent (helper partagé
 * avec l'aperçu client) :
 *  - la principale (ids[0]) est conservée : date, lieu, image, titre.
 *  - les autres → programme ajouté à la description ; catégories cumulées.
 *  - les fiches absorbées passent en statut 'archive' (réversible).
 */

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  try {
    const { ids, description: descOverride, categories: catsOverride } = await req.json()
    if (!Array.isArray(ids) || ids.length < 2) {
      return NextResponse.json({ error: 'Au moins 2 événements requis' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('evenements')
      .select('id, titre, description, heure, date_debut, categorie, categories')
      .in('id', ids)
    if (error) throw new Error(error.message)

    const events = (data ?? []) as MergeInput[]
    if (events.length < 2) {
      return NextResponse.json({ error: 'Événements introuvables' }, { status: 404 })
    }

    // Respecte l'ordre fourni : principal = ids[0]
    const ordered = ids
      .map(id => events.find(e => e.id === id))
      .filter((e): e is MergeInput => Boolean(e))

    const built = buildMergedEvent(ordered)

    // Overrides venant de l'aperçu (édition manuelle avant validation)
    const finalCats = Array.isArray(catsOverride) && catsOverride.length
      ? mergeCategories(catsOverride)
      : built.categories
    const finalDesc = typeof descOverride === 'string' ? descOverride : built.description

    const { error: upErr } = await supabaseAdmin
      .from('evenements')
      .update({ categories: finalCats, categorie: finalCats[0], description: finalDesc })
      .eq('id', built.principalId)
    if (upErr) throw new Error(upErr.message)

    const { error: arErr } = await supabaseAdmin
      .from('evenements')
      .update({ statut: 'archive' })
      .in('id', built.absorbedIds)
    if (arErr) throw new Error(arErr.message)

    return NextResponse.json({ success: true, principalId: built.principalId, archived: built.absorbedIds })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur' }, { status: 500 })
  }
}
