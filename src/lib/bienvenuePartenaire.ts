/**
 * E-mail de bienvenue Partenaire Local.
 *
 * Deux chemins mènent au plan 'pro' — le paiement Stripe (webhook) et
 * l'attribution manuelle depuis /admin/membres. Les deux appellent cette
 * fonction : le message part quel que soit le chemin, et une seule fois.
 *
 * Garde-fou : profiles.partenaire_bienvenue_at. Renseignée = déjà envoyé.
 * Voir scripts/2026-09-03_bienvenue_partenaire.sql.
 *
 * Fail-soft : un échec d'envoi ne marque pas la date et ne fait jamais
 * échouer l'appelant. Personne ne doit rater son abonnement parce qu'un
 * e-mail n'est pas parti.
 */
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendEmail, renderEmail } from '@/lib/email'
import { PLANS_INFO } from '@/lib/capabilities'

const SITE = 'https://laplaceduvillage.app'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Ce qui devient possible, formulé en ACTIONS et non en fonctionnalités.
 * La liste de référence reste PLANS_INFO.pro.features (capabilities.ts) : si
 * les droits changent là-bas, ce texte doit suivre.
 */
const OUVERTURES: { titre: string; detail: string }[] = [
  {
    titre: 'Ta fiche t’appartient',
    detail: 'Photos, horaires, présentation, contact : tu modifies tout, quand tu veux, sans passer par nous.',
  },
  {
    titre: 'Tes bons plans',
    detail: 'Tu crées tes promotions et elles apparaissent dans l’onglet Bons plans, sous les yeux du village.',
  },
  {
    titre: 'À la une de ta catégorie',
    detail: 'Ta fiche remonte dans le bandeau en tête de liste, là où les gens regardent en premier.',
  },
  {
    titre: 'Ta boutique, si tu vends',
    detail: 'Tu peux détailler tes produits et apparaître sur la carte des producteurs.',
  },
  {
    titre: 'Et tous les avantages Habitants',
    detail: 'Annonces illimitées, promos sans compteur, enchères 12 h avant tout le monde.',
  },
]

function corpsHtml(prenom: string | null): string {
  const bonjour = prenom ? `Bonjour ${esc(prenom)},` : 'Bonjour,'

  const liste = OUVERTURES.map(o => `
    <tr>
      <td style="padding:0 0 14px">
        <div style="font-weight:800;font-size:14px;color:#1A1209;margin-bottom:3px">${esc(o.titre)}</div>
        <div style="font-size:14px;line-height:1.6;color:#5A4A3A">${esc(o.detail)}</div>
      </td>
    </tr>`).join('')

  return `
    <p style="margin:0 0 14px;line-height:1.6">${bonjour}</p>

    <p style="margin:0 0 14px;line-height:1.6">
      Te voilà <strong>Partenaire Local</strong>. Merci — c’est ce qui fait vivre
      La Place du Village, et ça veut dire que ton commerce a maintenant sa vraie
      place dans le village, tenue par toi.
    </p>

    <p style="margin:0 0 8px;line-height:1.6;font-weight:700">Ce qui t’est ouvert :</p>

    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 6px">
      ${liste}
    </table>

    <p style="margin:0 0 4px;line-height:1.6">
      <strong>Par où commencer ?</strong> Complète ta fiche. Une bonne photo, tes
      horaires à jour et quelques lignes de présentation : c’est ce qui fait la
      différence entre une fiche qu’on croise et une fiche qui donne envie de
      pousser la porte.
    </p>`
}

function piedHtml(): string {
  return `Tu reçois ce message parce que tu viens de devenir Partenaire Local sur La Place du Village.<br/>
    Une question, un doute, une idée ? <a href="${SITE}/support" style="color:#2D5A3D">Écris-nous</a>, on répond.`
}

/**
 * Envoie l'e-mail de bienvenue si ce compte ne l'a jamais reçu.
 *
 * @param userId le compte qui vient de passer Partenaire Local
 */
export async function envoyerBienvenuePartenaire(userId: string): Promise<void> {
  try {
    const { data: profil } = await supabaseAdmin
      .from('profiles')
      .select('email, display_name, plan, partenaire_bienvenue_at')
      .eq('user_id', userId)
      .maybeSingle()

    if (!profil?.email) return
    // Le plan est relu ICI plutôt que passé en argument : l'appelant vient de
    // l'écrire, on part de ce que la base dit vraiment.
    if (profil.plan !== 'pro') return
    if (profil.partenaire_bienvenue_at) return

    // Lien vers SA fiche si elle existe déjà (cas d'un abonnement pris depuis
    // une revendication), sinon vers l'app.
    const { data: etab } = await supabaseAdmin
      .from('etablissements')
      .select('id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle()

    const lienFiche = etab?.id ? `${SITE}/etablissement/${etab.id}` : SITE

    const html = renderEmail({
      titre: `Bienvenue parmi les Partenaires Locaux ${PLANS_INFO.pro.icon}`,
      bodyHtml: corpsHtml((profil.display_name as string | null) ?? null),
      cta: { href: lienFiche, label: etab?.id ? 'Compléter ma fiche' : 'Ouvrir La Place du Village' },
      footerHtml: piedHtml(),
    })

    const r = await sendEmail({
      to: profil.email as string,
      subject: 'Bienvenue parmi les Partenaires Locaux',
      html,
    })

    // Échec (quota Resend, adresse invalide…) : on ne marque pas, une
    // prochaine occasion réessaiera.
    if (!r.ok) return

    await supabaseAdmin
      .from('profiles')
      .update({ partenaire_bienvenue_at: new Date().toISOString() })
      .eq('user_id', userId)
  } catch {
    // Jamais bloquant pour l'appelant : ni le paiement ni l'action admin ne
    // doivent échouer parce qu'un e-mail n'est pas parti.
  }
}
