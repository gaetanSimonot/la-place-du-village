import { supabaseAdmin } from './supabase-admin'

/**
 * LES INVITÉS D'UN MODULE — côté serveur, et seulement côté serveur.
 *
 * Ce fichier importe `supabase-admin` : il ne doit JAMAIS être importé par
 * un composant client, sous peine de faire planter la page. Même règle que
 * `theatre-server.ts` et `cinema-server.ts`.
 *
 * La liste ne sort jamais d'ici vers un écran public. `estInvite()` répond
 * oui ou non pour UN lecteur ; c'est tout ce dont une page a besoin, et
 * c'est tout ce qu'elle obtient.
 *
 * Tolérant à l'absence de la table : tant que la migration
 * `2026-09-21_module_invites.sql` n'est pas jouée, il n'y a simplement
 * personne d'invité. Un réglage pas encore livré ne doit pas mettre par
 * terre l'écran Village de tout le monde.
 */

async function lignes(cle: string, territoireId: string | null): Promise<string[] | null> {
  let q = supabaseAdmin.from('module_invites').select('user_id').eq('cle', cle)
  q = territoireId ? q.eq('territoire_id', territoireId) : q.is('territoire_id', null)
  const { data, error } = await q
  if (error) return null
  return (data ?? []).map(r => r.user_id as string)
}

/** Ce lecteur-ci est-il invité ? La seule question qu'une page publique pose. */
export async function estInvite(
  cle: string,
  territoireId: string | null,
  userId: string | null,
): Promise<boolean> {
  if (!userId) return false
  const ids = await lignes(cle, territoireId)
  return !!ids && ids.includes(userId)
}

/** La liste entière. Réservé à l'administration, jamais à une page publique. */
export async function listerInvites(
  cle: string,
  territoireId: string | null,
): Promise<string[]> {
  return (await lignes(cle, territoireId)) ?? []
}

/**
 * Remplace la liste d'un coup.
 *
 * On efface puis on réécrit plutôt que de calculer un différentiel : la
 * liste tient en quelques lignes, et un différentiel est un endroit de plus
 * où se tromper. En deux temps sans transaction : le pire cas est une liste
 * vidée sans être réécrite, soit un réglage à refaire — jamais une
 * invitation fantôme.
 */
export async function remplacerInvites(
  cle: string,
  territoireId: string | null,
  userIds: string[],
): Promise<{ ok: boolean; error?: string }> {
  let del = supabaseAdmin.from('module_invites').delete().eq('cle', cle)
  del = territoireId ? del.eq('territoire_id', territoireId) : del.is('territoire_id', null)
  const { error: errDel } = await del
  if (errDel) return { ok: false, error: errDel.message }

  const vus: Record<string, true> = {}
  const propres = userIds.filter(id => {
    if (typeof id !== 'string' || !id.trim() || vus[id]) return false
    vus[id] = true
    return true
  })
  if (!propres.length) return { ok: true }

  const { error } = await supabaseAdmin.from('module_invites').insert(
    propres.map(user_id => ({ cle, user_id, territoire_id: territoireId })),
  )
  return error ? { ok: false, error: error.message } : { ok: true }
}
