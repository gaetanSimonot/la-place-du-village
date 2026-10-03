/**
 * Bienvenue Habitant — e-mail + notification dans l'app.
 *
 * Même logique que bienvenuePartenaire : deux chemins mènent au plan
 * 'habitants' (paiement Stripe, attribution manuelle dans /admin/membres) et
 * l'appelant décide du BASCULEMENT en comparant le plan d'avant et d'après.
 * Fail-soft : un échec d'envoi ne fait jamais échouer le paiement.
 *
 * Le mail est le gabarit de Gaëtan (gabaritBienvenueHabitant.ts), envoyé tel
 * quel ; seul le prénom du titre est rempli ici.
 */
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendEmail } from '@/lib/email'
import { notifyUser } from '@/lib/server-auth'
import { GABARIT_BIENVENUE_HABITANT } from '@/lib/gabaritBienvenueHabitant'

export const SUJET_BIENVENUE_HABITANT = 'Bienvenue sur La Place ! Votre abonnement Habitant est actif'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Le prénom pour le titre « Bienvenue sur La Place, Nat ! » : le premier mot
 * du nom affiché (Google donne « Prénom Nom »). Sans nom : « Bienvenue sur
 * La Place ! », le repli prévu par Gaëtan.
 */
function prenomDe(nom: string | null): string | null {
  const premier = (nom ?? '').trim().split(/\s+/)[0]
  return premier && premier.length <= 30 ? premier : null
}

export function htmlBienvenueHabitant(nomAffiche: string | null): string {
  const prenom = prenomDe(nomAffiche)
  return GABARIT_BIENVENUE_HABITANT.replace('{{VIRGULE_PRENOM}}', prenom ? `, ${esc(prenom)}` : '')
}

/**
 * Envoie le mail et la notification.
 *
 * @param userId le compte qui vient de passer Habitant
 * @param test   envoi d'essai : pas de vérification du plan, et le mail part
 *               à `test.email` au lieu de l'adresse du compte
 */
export async function envoyerBienvenueHabitant(userId: string, test?: { email: string }): Promise<{ mail: boolean; notif: boolean }> {
  const res = { mail: false, notif: false }
  try {
    const { data: profil } = await supabaseAdmin
      .from('profiles').select('email, display_name, plan').eq('user_id', userId).maybeSingle()
    if (!profil) return res
    if (!test && profil.plan !== 'habitants') return res

    const dest = test?.email ?? (profil.email as string | null)
    if (dest) {
      const r = await sendEmail({ to: dest, subject: SUJET_BIENVENUE_HABITANT, html: htmlBienvenueHabitant((profil.display_name as string | null) ?? null) })
      res.mail = !!r.ok
    }
    // Pas de target_type : sa colonne a une contrainte CHECK, un nouveau
    // type y serait refusé en silence. La destination se règle par `type`
    // dans notifRouting.
    await notifyUser(userId, { type: 'bienvenue_habitant', actor_name: 'La Place du Village' })
    res.notif = true
  } catch {
    // Jamais bloquant pour l'appelant.
  }
  return res
}
