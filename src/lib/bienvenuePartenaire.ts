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
 *
 * TEXTE — écrit par Gaëtan, vouvoiement. Deux réserves signalées le
 * 03/09/2026, à trancher avant de compter dessus :
 *   - « mise en avant dans les résultats de recherche » : la recherche
 *     globale (HubSearchModal) ne trie PAS par is_featured aujourd'hui. Seul
 *     l'annuaire le fait (/api/etablissements, .order('is_featured')).
 *   - « proposer vos articles au Journal Local » : /journal/articles/nouveau
 *     est ouvert à tout compte connecté, ce n'est pas un avantage Partenaire.
 */
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendEmail, renderEmail, boutonEmail } from '@/lib/email'

const SITE = 'https://laplaceduvillage.app'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Paragraphe courant. */
const p = (html: string) => `<p style="margin:0 0 14px;line-height:1.65;font-size:15px;color:#3C2C20">${html}</p>`

/** Intertitre de section. */
const h = (texte: string) =>
  `<p style="margin:26px 0 10px;font-size:16px;font-weight:800;line-height:1.35;color:#1A1209">${esc(texte)}</p>`

/** Puces de la liste d'avantages. */
const AVANTAGES = [
  'une <strong>mise en avant dans les résultats de recherche</strong>',
  'une <strong>meilleure visibilité dans vos catégories</strong>',
  'des <strong>mises en avant dans notre newsletter locale</strong>',
  'des <strong>promotions locales illimitées</strong>',
  'l’<strong>accès complet aux fonctionnalités de l’application</strong>',
  'davantage de possibilités pour <strong>enrichir et personnaliser votre fiche</strong>',
  'un <strong>kit de création pour votre communication</strong>',
  'la possibilité de <strong>proposer vos articles et actualités au Journal Local</strong>',
  'et d’autres outils réservés aux Partenaires Locaux.',
]

function corpsHtml(prenom: string | null, lienFiche: string, lienPromos: string): string {
  const bonjour = prenom ? `Bonjour ${esc(prenom)},` : 'Bonjour,'

  const puces = AVANTAGES.map(a => `
    <tr>
      <td style="padding:0 0 8px;font-size:15px;line-height:1.6;color:#3C2C20">
        <span style="color:#2D5A3D">•</span>&nbsp; ${a}
      </td>
    </tr>`).join('')

  return [
    p(bonjour),

    p('Bienvenue parmi les <strong>Partenaires Locaux de La Place du Village</strong>, et merci pour votre confiance !'),

    p('Votre abonnement est maintenant actif. Votre établissement bénéficie dès aujourd’hui de <strong>plus de visibilité sur La Place du Village</strong> et de nouveaux outils pour faire connaître votre activité auprès des habitants.'),

    p('Concrètement, vous profitez notamment de :'),

    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 4px">${puces}</table>`,

    h('Pour bien commencer : créez une promotion locale'),
    p('Une remise sur une prestation, un petit cadeau, une offre découverte, un avantage réservé aux habitants… <strong>même une offre toute simple peut vous apporter immédiatement plus de visibilité.</strong>'),
    p('Dès sa publication, votre offre apparaît dans l’onglet <strong>Promotions</strong>, l’un des espaces les plus consultés de La Place du Village après la carte des événements.'),
    boutonEmail(lienPromos, 'Créer ma première promotion'),

    h('Faites aussi vivre votre fiche'),
    p('Ajoutez vos plus belles photos, vérifiez vos horaires, présentez votre activité et mettez régulièrement vos informations à jour.'),
    p('Une fiche complète permet aux habitants de mieux vous connaître et vous aide à <strong>profiter au maximum des différentes mises en avant incluses dans votre abonnement.</strong>'),
    boutonEmail(lienFiche, 'Compléter ma fiche'),

    h('La Place du Village évolue avec vous'),
    p('La Place du Village est en constante évolution. Nous ajoutons régulièrement de nouvelles fonctionnalités pour mieux mettre en valeur les acteurs locaux et faciliter les échanges avec les habitants.'),
    p(`Une question ? Une difficulté ? Une suggestion ou une idée pour améliorer la plateforme ? <a href="${SITE}/support" style="color:#2D5A3D;font-weight:700">Écrivez-nous.</a> Vos retours nous aident directement à faire évoluer La Place du Village.`),
    p('Et surtout, <strong>merci de participer à cette aventure locale.</strong> En rejoignant les Partenaires Locaux, vous contribuez à rendre plus visibles les commerces, services, producteurs, associations et initiatives qui font vivre notre territoire au quotidien.'),

    p('À très bientôt sur La Place du Village,'),
    p('L’équipe de <strong>La Place du Village</strong>'),
  ].join('')
}

function piedHtml(): string {
  return `Vous recevez ce message parce que votre abonnement Partenaire Local vient d’être activé sur La Place du Village.<br/>
    <a href="${SITE}/support" style="color:#9A8A7A">Nous écrire</a>`
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

    // Les deux boutons pointent vers SA fiche : c'est là que vivent le
    // gestionnaire de promotions et l'édition. L'ancre #promotions amène
    // directement au bon bloc. Sans fiche (abonnement pris avant de
    // revendiquer), on renvoie sur l'app plutôt que sur une page inexistante.
    const { data: etab } = await supabaseAdmin
      .from('etablissements')
      .select('id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle()

    const lienFiche  = etab?.id ? `${SITE}/etablissement/${etab.id}` : SITE
    const lienPromos = etab?.id ? `${SITE}/etablissement/${etab.id}#promotions` : SITE

    const html = renderEmail({
      // Pas de titre : le message porte sa propre accroche dès la première
      // ligne, un h1 la répéterait.
      bodyHtml: corpsHtml((profil.display_name as string | null) ?? null, lienFiche, lienPromos),
      footerHtml: piedHtml(),
    })

    const r = await sendEmail({
      to: profil.email as string,
      subject: 'Bienvenue parmi les Partenaires Locaux de La Place du Village',
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
