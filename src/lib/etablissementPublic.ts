import { supabaseAdmin } from '@/lib/supabase-admin'
import { mergeDraft, shouldApplyDraft } from '@/lib/etab-drafts'

/**
 * La fiche commerce telle que le public la voit : la version officielle,
 * fusionnée avec le brouillon du propriétaire quand son offre le rend public.
 *
 * SERVEUR UNIQUEMENT (clé service). Partagée par GET /api/etablissements/[id]
 * et la fiche serveur /etablissement/[id] : les deux montrent forcément la
 * même chose.
 */
export async function lireEtablissementPublic(id: string): Promise<{ ok: true; etab: Record<string, unknown> | null } | { ok: false; erreur: string }> {
  const { data: etab, error } = await supabaseAdmin
    .from('etablissements')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) return { ok: false, erreur: error.message }
  if (!etab) return { ok: true, etab: null }

  // Pas de proprio → version officielle pure
  if (!etab.user_id) return { ok: true, etab }

  // Charge le draft + le plan du proprio en parallèle
  const [draftRes, profileRes] = await Promise.all([
    supabaseAdmin
      .from('etablissement_drafts')
      .select('user_id, fields')
      .eq('etablissement_id', id)
      .eq('user_id', etab.user_id)
      .maybeSingle(),
    supabaseAdmin
      .from('profiles')
      .select('plan')
      .eq('user_id', etab.user_id)
      .maybeSingle(),
  ])

  const draft = draftRes.data
  const ownerPlan = profileRes.data?.plan

  const apply = draft && shouldApplyDraft({
    etabUserId: etab.user_id,
    draftUserId: draft.user_id,
    ownerPlan,
  })

  return { ok: true, etab: apply ? mergeDraft(etab, draft.fields as Record<string, unknown>) : etab }
}

/**
 * Une fiche « remplie » : elle a une description. Seules celles-là sont
 * proposées à Google ; les autres (un nom, une adresse, une photo importée)
 * restent dans l'app, inchangées, mais marquées « ne pas indexer » — mille
 * pages presque vides feraient baisser la note de tout le site.
 */
export function ficheRemplie(e: { description_courte?: unknown; description_longue?: unknown }): boolean {
  const txt = (v: unknown) => typeof v === 'string' && v.trim().length > 0
  return txt(e.description_courte) || txt(e.description_longue)
}
