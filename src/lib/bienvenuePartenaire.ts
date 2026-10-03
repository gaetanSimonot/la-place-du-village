/**
 * E-mail de bienvenue Partenaire Local.
 *
 * Deux chemins mènent au plan 'pro' — le paiement Stripe (webhook) et
 * l'attribution manuelle depuis /admin/membres. Les deux appellent cette
 * fonction : le message part quel que soit le chemin.
 *
 * Déclencheur : le BASCULEMENT vers 'pro', décidé par l'appelant qui compare
 * le plan d'avant et celui d'après. Réenregistrer un partenaire ne renvoie
 * donc rien, mais le repasser en basic puis en Partenaire réenvoie le
 * message — autant de fois que voulu, ce qui rend le test trivial.
 *
 * Fail-soft : un échec d'envoi ne fait jamais échouer l'appelant. Personne
 * ne doit rater son abonnement parce qu'un e-mail n'est pas parti.
 *
 * Le mail est le gabarit de Gaëtan (gabaritBienvenuePartenaire.ts, depuis le
 * 04/10/2026), envoyé tel quel ; seuls le nom et deux liens sont remplis ici.
 * Deux promesses du texte à garder en tête (signalées le 03/09/2026) :
 *   - « mise en avant dans les résultats de recherche » : la recherche
 *     globale (HubSearchModal) ne trie PAS par is_featured ; seul l'annuaire
 *     le fait (/api/etablissements, .order('is_featured')).
 *   - « proposer vos articles au Journal Local » : /journal/articles/nouveau
 *     est ouvert à tout compte connecté.
 */
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendEmail } from '@/lib/email'
import { notifyUser } from '@/lib/server-auth'
import { GABARIT_BIENVENUE_PARTENAIRE } from '@/lib/gabaritBienvenuePartenaire'

const SITE = 'https://laplaceduvillage.app'

export const SUJET_BIENVENUE_PARTENAIRE = 'Bienvenue parmi les Partenaires Locaux de La Place !'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * @param nom      le nom du commerce (à défaut, le nom affiché du compte)
 * @param etabId   sa fiche, pour le bouton « Compléter ma fiche »
 */
export function htmlBienvenuePartenaire(nom: string | null, etabId: string | null): string {
  return GABARIT_BIENVENUE_PARTENAIRE
    .replace('{{BONJOUR}}', nom?.trim() ? `Bonjour ${esc(nom.trim())}` : 'Bonjour')
    // Le circuit « créer un bon plan » de la page Bons plans : il propose ses
    // fiches et ouvre le formulaire lié à celle qu'on choisit.
    .replace('{{LIEN_PROMO}}', `${SITE}/promotions?nouveau=1`)
    // La fiche : c'est là que vivent l'édition, les photos et les horaires.
    .replace('{{LIEN_FICHE}}', etabId ? `${SITE}/etablissement/${etabId}` : SITE)
}

/**
 * Envoie l'e-mail de bienvenue.
 *
 * L'appelant a déjà vérifié qu'il s'agit d'un basculement vers 'pro' ; on
 * relit tout de même le plan en base avant d'écrire à qui que ce soit.
 *
 * @param userId le compte qui vient de passer Partenaire Local
 * @param test   envoi d'essai : pas de vérification du plan, mail à `test.email`
 */
export async function envoyerBienvenuePartenaire(userId: string, test?: { email: string }): Promise<void> {
  try {
    const { data: profil } = await supabaseAdmin
      .from('profiles')
      .select('email, display_name, plan')
      .eq('user_id', userId)
      .maybeSingle()

    const dest = test?.email ?? (profil?.email as string | null | undefined)
    if (!profil || !dest) return
    // Le plan est relu ICI plutôt que passé en argument : l'appelant vient de
    // l'écrire, on part de ce que la base dit vraiment.
    if (!test && profil.plan !== 'pro') return

    // Sans fiche (abonnement pris avant de revendiquer) : le nom du compte, et
    // « Compléter ma fiche » renvoie sur l'app.
    const { data: etab } = await supabaseAdmin
      .from('etablissements')
      .select('id, nom')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle()

    const r = await sendEmail({
      to: dest,
      subject: SUJET_BIENVENUE_PARTENAIRE,
      html: htmlBienvenuePartenaire((etab?.nom as string | null) ?? (profil.display_name as string | null) ?? null, (etab?.id as string | null) ?? null),
    })

    // Échec (quota Resend, adresse invalide…) : silencieux côté appelant.
    // Le prochain basculement réessaiera.
    void r

    // La version app du message (BienvenuePartenaireModal), ouverte par sa
    // notification. Pas en essai : l'essai ne vise que le mail. Pas de
    // target_type (contrainte CHECK) : la destination se règle par `type`.
    if (!test) await notifyUser(userId, { type: 'bienvenue_partenaire', actor_name: 'La Place du Village' })
  } catch {
    // Jamais bloquant pour l'appelant : ni le paiement ni l'action admin ne
    // doivent échouer parce qu'un e-mail n'est pas parti.
  }
}
