import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/server-auth'
import { mergeCategories, eventCategories } from '@/lib/categories'

/**
 * POST /api/admin/evenements/merge
 * Body : { ids: string[] }  (≥ 2 ; ids[0] = fiche principale conservée)
 *
 * Fusion DÉTERMINISTE (aucun appel LLM) :
 *  - la fiche principale (ids[0]) est conservée : date, lieu, image, titre.
 *  - les autres fiches deviennent son PROGRAMME, ajouté à la description
 *    (ligne "• HH:MM — Titre : description").
 *  - les catégories de toutes les fiches sont CUMULÉES (union dédupliquée),
 *    la catégorie principale reste celle de la fiche principale.
 *  - les fiches absorbées passent en statut 'archive' (réversible, non détruit).
 */

interface Row {
  id: string
  titre: string
  description: string | null
  heure: string | null
  date_debut: string | null
  categorie: string | null
  categories: string[] | null
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  try {
    const { ids } = await req.json()
    if (!Array.isArray(ids) || ids.length < 2) {
      return NextResponse.json({ error: 'Au moins 2 événements requis' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('evenements')
      .select('id, titre, description, heure, date_debut, categorie, categories')
      .in('id', ids)
    if (error) throw new Error(error.message)

    const events = (data ?? []) as Row[]
    if (events.length < 2) {
      return NextResponse.json({ error: 'Événements introuvables' }, { status: 404 })
    }

    // Respecte l'ordre de sélection : principal = ids[0]
    const ordered = ids
      .map(id => events.find(e => e.id === id))
      .filter((e): e is Row => Boolean(e))
    const principal = ordered[0]
    const absorbed  = ordered.slice(1)

    // Union des catégories (principal d'abord → reste la principale)
    const cats = mergeCategories(...ordered.map(e => eventCategories(e)))

    // Programme construit à partir des fiches absorbées
    const lines = absorbed.map(e => {
      const h = e.heure ? `${e.heure.slice(0, 5)} — ` : ''
      const d = e.description?.trim() ? ` : ${e.description.trim()}` : ''
      return `• ${h}${e.titre}${d}`
    })
    const programme = lines.length ? `\n\nProgramme :\n${lines.join('\n')}` : ''
    const newDescription = `${(principal.description ?? '').trim()}${programme}`.trim()

    const { error: upErr } = await supabaseAdmin
      .from('evenements')
      .update({ categories: cats, categorie: cats[0], description: newDescription })
      .eq('id', principal.id)
    if (upErr) throw new Error(upErr.message)

    const absorbedIds = absorbed.map(e => e.id)
    const { error: arErr } = await supabaseAdmin
      .from('evenements')
      .update({ statut: 'archive' })
      .in('id', absorbedIds)
    if (arErr) throw new Error(arErr.message)

    return NextResponse.json({ success: true, principalId: principal.id, archived: absorbedIds })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur' }, { status: 500 })
  }
}
