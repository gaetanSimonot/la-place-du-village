import { supabaseAdmin } from '@/lib/supabase-admin'
import { CINEMA_FIELDS, type Cinema } from '@/lib/cinema'

/**
 * MODULE CINÉMA — accès base, SERVEUR UNIQUEMENT.
 *
 * Séparé de cinema.ts parce que ce fichier importe `supabase-admin`, qui
 * porte la clé service : importé depuis un composant client, il construit un
 * client Supabase sans clé et fait planter la page. Ne jamais l'importer
 * ailleurs que dans une route d'API.
 */

/**
 * La fiche est-elle un cinéma actif, et cette personne peut-elle l'administrer ?
 *
 * À appeler CÔTÉ SERVEUR avant toute écriture : masquer un bouton dans l'UI
 * n'est pas une garde. L'admin de l'app passe partout.
 */
export async function peutAdministrerCinema(
  etablissementId: string,
  userId: string,
  isAdmin: boolean,
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('etablissements')
    .select('user_id, plan, module_cinema')
    .eq('id', etablissementId)
    .maybeSingle()
  if (!data?.module_cinema) return false
  if (isAdmin) return true
  return data.user_id === userId && data.plan === 'pro'
}

/** Les fiches ayant le module accordé. Vide tant que rien n'est accordé. */
export async function listerCinemas(): Promise<Cinema[]> {
  const { data } = await supabaseAdmin
    .from('etablissements')
    .select(CINEMA_FIELDS)
    .eq('module_cinema', true)
    .order('nom')
  return (data ?? []) as Cinema[]
}
