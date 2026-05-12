/**
 * Logique drafts d'établissements.
 *
 * Architecture :
 *   - etablissements      = version officielle (source de vérité publique)
 *   - etablissement_drafts = modifs perso d'un user (gestionnaire)
 *
 * La fiche publique est la version officielle MERGE avec le draft du
 * propriétaire actuel SI ce dernier a un plan Pro/Max.
 *
 * Bénéfices :
 *   - Anti-vandalisme : modifs disparaissent à release / cancel Stripe
 *   - UX : user retrouve ses modifs s'il re-revendique la fiche
 *   - Admin : la version officielle reste toujours intacte
 */

/** Champs que le user peut modifier via le draft system */
export const DRAFT_EDITABLE_FIELDS = [
  'nom',
  'description_courte',
  'description_longue',
  'contact_tel',
  'contact_whatsapp',
  'site_web',
  'horaires',
  'photos',
] as const

export type DraftableField = typeof DRAFT_EDITABLE_FIELDS[number]

export interface EtablissementDraft {
  etablissement_id: string
  user_id: string
  fields: Record<string, unknown>
  updated_at?: string
}

/** Filtre un body d'API pour ne garder que les champs autorisés en draft */
export function pickDraftableFields(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of DRAFT_EDITABLE_FIELDS) {
    if (k in body) out[k] = body[k] === '' ? null : body[k]
  }
  return out
}

/**
 * Merge un draft sur une fiche établissement.
 * Les valeurs non-null du draft écrasent celles de la fiche officielle.
 */
export function mergeDraft<T extends Record<string, unknown>>(
  etab: T,
  draftFields: Record<string, unknown> | null | undefined,
): T {
  if (!draftFields) return etab
  const merged = { ...etab } as Record<string, unknown>
  for (const k of DRAFT_EDITABLE_FIELDS) {
    if (k in draftFields && draftFields[k] !== null && draftFields[k] !== undefined) {
      merged[k] = draftFields[k]
    }
  }
  return merged as T
}

/** Le draft d'un user doit-il être appliqué publiquement ? */
export function shouldApplyDraft(args: {
  etabUserId: string | null
  draftUserId: string
  ownerPlan: string | null | undefined
}): boolean {
  // Le draft n'est appliqué que si :
  //  - l'user du draft est bien le propriétaire actuel de la fiche
  //  - et le propriétaire a un plan Pro ou Max
  if (!args.etabUserId) return false
  if (args.draftUserId !== args.etabUserId) return false
  if (!args.ownerPlan || args.ownerPlan === 'basic') return false
  return true
}
