/**
 * Rendu email (HTML) de la newsletter par blocs + du mail d'invitation.
 * Côté serveur : les blocs "contenu" tirent les données fraîches du site.
 *
 * ── Règles email, non négociables ────────────────────────────────────────
 * Tables `role="presentation"` uniquement — ni flex, ni grid, ni position.
 * Tout le style inliné ; la seule feuille porte le point de rupture mobile.
 * Aucun SVG, aucune police web, aucun script. Largeur explicite sur chaque
 * table (Outlook). Boutons « bulletproof » : `<td bgcolor>` + `<a display:block>`.
 *
 * `mso-line-height-rule:exactly` accompagne CHAQUE `line-height` : sans lui,
 * Outlook applique sa propre interlettre et casse les hauteurs calées.
 */
import type { NewsletterBlock, ContentItem } from '@/lib/newsletterBlocks'
import { getContent, getSemaineChiffres } from '@/lib/newsletterContent'
import type { Categorie } from '@/lib/types'

const SITE = 'https://laplaceduvillage.app'

/** Actifs servis par le site — jamais inlinés : ils ne pèsent pas dans l'email. */
const IMAGE_SEMAINE = `${SITE}/nl-hero.jpg`
const ICON_BASE     = `${SITE}/nl-icons/`

/** Piles de polices. Pas de Georgia sur les titres : ça faisait vieillot. */
const TITRE  = `-apple-system,'Segoe UI','Helvetica Neue',Arial,Helvetica,sans-serif`
const TEXTE  = `Arial,Helvetica,sans-serif`
const SCRIPT = `'Segoe Script','Brush Script MT',Georgia,cursive`

/**
 * Le prénom du destinataire, remplacé À L'ENVOI et non au rendu.
 *
 * Le corps de la lettre est figé une fois pour toutes (« édition en file ») et
 * envoyé à des centaines de personnes : on ne peut pas y écrire un prénom au
 * moment du rendu. On laisse donc une marque, remplacée par destinataire au
 * même endroit que le jeton de désabonnement. Cf. `personnaliser()`.
 */
export const MARQUE_PRENOM = '%%PRENOM%%'

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const textHtml = (t: string) => t.split(/\n{2,}/)
  .map(p => `<p style="margin:0 0 12px;font-family:${TEXTE};font-size:15px;color:#2C1810;mso-line-height-rule:exactly;line-height:24px">${esc(p).replace(/\n/g, '<br/>')}</p>`)
  .join('')

const SEE_ALL: Record<string, string> = {
  events: `${SITE}/agenda`, promos: `${SITE}/promotions`, annonces: `${SITE}/annonces`,
  partenaires: `${SITE}/annuaire`, article: `${SITE}/journal/articles`,
}

/**
 * Libellés des tuiles, au pluriel et raccourcis.
 *
 * Table LOCALE au rendu : `categories.ts` sert la carte, l'agenda et les
 * filtres, où « Marché » au singulier est juste. On ne le tord pas pour un
 * email — « Santé & bien-être » ne tiendrait de toute façon pas sur 68 px.
 */
const LIBELLES_NL: Record<Categorie, string> = {
  marche: 'Marchés', concert: 'Concerts', fete: 'Fêtes', atelier: 'Ateliers',
  sport: 'Sport', theatre: 'Théâtre', sante_bien_etre: 'Bien-être', autre: 'Autres',
}

/** Nom de fichier de l'icône — `sante_bien_etre` se raccourcit en `sante`. */
const ICONE: Record<Categorie, string> = {
  marche: 'marche', concert: 'concert', fete: 'fete', atelier: 'atelier',
  sport: 'sport', theatre: 'theatre', sante_bien_etre: 'sante', autre: 'autre',
}

/* ── Fragments partagés ─────────────────────────────────────────────────── */

/** En-tête de section : orange, majuscules, sans filet. */
function sectionHeader(titre: string, seeAllHref?: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:6px 0 12px"><tr>
    <td style="font-family:${TEXTE};font-size:13px;font-weight:bold;letter-spacing:.8px;text-transform:uppercase;color:#C4622D;mso-line-height-rule:exactly;line-height:18px">${esc(titre)}</td>
    ${seeAllHref ? `<td align="right" style="font-family:${TEXTE};font-size:12px;font-weight:bold"><a href="${seeAllHref}" style="color:#2D5A3D;text-decoration:none">Voir tout &rarr;</a></td>` : ''}
  </tr></table>`
}

/** Bouton pleine largeur, à l'épreuve d'Outlook. */
function bouton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td align="center" bgcolor="#2D5A3D" style="background-color:#2D5A3D;border-radius:12px"><a href="${esc(href)}" style="display:block;padding:14px 18px;font-family:${TEXTE};font-size:14px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:12px">${label}</a></td></tr></table>`
}

function gridCard(it: ContentItem): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#FFFFFF" style="background-color:#FFFFFF;border:1px solid #EAE2D6;border-radius:10px">
    ${it.image
      ? `<tr><td style="font-size:0;line-height:0"><a href="${esc(it.href)}"><img src="${esc(it.image)}" alt="" width="252" style="display:block;width:100%;height:104px;object-fit:cover;border:0;border-radius:10px 10px 0 0"/></a></td></tr>`
      : `<tr><td align="center" bgcolor="#F2ECE2" height="104" style="height:104px;border-radius:10px 10px 0 0;font-family:${TEXTE};font-size:10px;color:#A99B89">&nbsp;</td></tr>`}
    <tr><td style="padding:8px 10px">
      <div style="font-family:${TEXTE};font-size:13px;font-weight:bold;color:#1A1209;mso-line-height-rule:exactly;line-height:17px"><a href="${esc(it.href)}" style="color:#1A1209;text-decoration:none">${esc(it.title)}</a></div>
      ${it.sub ? `<div style="padding-top:2px;font-family:${TEXTE};font-size:11px;color:#7A6A5A;mso-line-height-rule:exactly;line-height:15px">${esc(it.sub)}</div>` : ''}
    </td></tr>
  </table>`
}

/** Grille à deux colonnes, empilée sur mobile par la classe `col`. */
function grid(items: ContentItem[]): string {
  let rows = ''
  for (let i = 0; i < items.length; i += 2) {
    const a = items[i], b = items[i + 1]
    rows += `<tr>
      <td width="50%" valign="top" class="col" style="padding:0 4px 8px 0">${gridCard(a)}</td>
      <td width="50%" valign="top" class="col" style="padding:0 0 8px 4px">${b ? gridCard(b) : '&nbsp;'}</td>
    </tr>`
  }
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table>`
}

function journalCard(it: ContentItem): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1A1209" style="background-color:#1A1209;border-radius:14px">
    ${it.image ? `<tr><td style="font-size:0;line-height:0"><a href="${esc(it.href)}"><img src="${esc(it.image)}" alt="" width="514" style="display:block;width:100%;max-height:240px;object-fit:cover;border:0;border-radius:14px 14px 0 0"/></a></td></tr>` : ''}
    <tr><td style="padding:16px 18px">
      <div style="font-family:${TEXTE};font-size:11px;font-weight:bold;letter-spacing:1.1px;text-transform:uppercase;color:#E8C58A;mso-line-height-rule:exactly;line-height:16px">${esc(it.sub ?? 'Le Journal du Village')}</div>
      <div style="padding:4px 0 12px;font-family:${TITRE};font-size:21px;letter-spacing:-0.6px;font-weight:bold;color:#FFFFFF;mso-line-height-rule:exactly;line-height:28px">${esc(it.title)}</div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#E8C58A" style="border-radius:10px"><a href="${esc(it.href)}" style="display:block;padding:10px 20px;font-family:${TEXTE};font-size:13px;font-weight:bold;color:#1A1209;text-decoration:none;border-radius:10px">Lire le Journal &rarr;</a></td></tr></table>
    </td></tr>
  </table>`
}

function articleCard(it: ContentItem): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#FFFFFF" style="background-color:#FFFFFF;border:1px solid #EAE2D6;border-radius:12px">
    ${it.image ? `<tr><td style="font-size:0;line-height:0"><a href="${esc(it.href)}"><img src="${esc(it.image)}" alt="" width="514" style="display:block;width:100%;height:180px;object-fit:cover;border:0;border-radius:12px 12px 0 0"/></a></td></tr>` : ''}
    <tr><td style="padding:14px 16px">
      <div style="font-family:${TEXTE};font-size:17px;font-weight:bold;color:#1A1209;mso-line-height-rule:exactly;line-height:22px">${esc(it.title)}</div>
      ${it.sub ? `<div style="padding-top:6px;font-family:${TEXTE};font-size:13px;color:#7A6A5A;mso-line-height-rule:exactly;line-height:20px">${esc(it.sub)}</div>` : ''}
      <div style="padding-top:10px;font-family:${TEXTE};font-size:13px;font-weight:bold"><a href="${esc(it.href)}" style="color:#2D5A3D;text-decoration:none">Lire l&rsquo;article &rarr;</a></div>
    </td></tr>
  </table>`
}

/* ── Les blocs ──────────────────────────────────────────────────────────── */

async function renderBlock(b: NewsletterBlock, semaineLibelle: string): Promise<string> {
  switch (b.type) {
    /**
     * Bandeau vert. Les deux dernières lignes sont FIGÉES : c'est l'identité
     * de la lettre, pas du contenu éditable. `imageUrl` n'est plus rendue —
     * un actif hébergé de moins ; le champ reste dans le modèle.
     */
    case 'header':
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td bgcolor="#2D5A3D" style="background-color:#2D5A3D;border-radius:14px">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td align="center" style="padding:26px 24px 24px">
            <div style="font-family:${TEXTE};font-size:10px;font-weight:bold;letter-spacing:2.6px;text-transform:uppercase;color:#B9D3C2;mso-line-height-rule:exactly;line-height:15px">Sud C&eacute;vennes</div>
            <div style="padding-top:9px;font-family:${TITRE};font-size:21px;letter-spacing:-0.6px;font-weight:bold;color:#FFFFFF;mso-line-height-rule:exactly;line-height:26px">${esc(b.titre)}</div>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:16px auto 15px"><tr><td width="46" height="1" bgcolor="#D8B87E" style="width:46px;height:1px;font-size:0;line-height:0">&nbsp;</td></tr></table>
            <div style="font-family:${TITRE};font-size:34px;letter-spacing:-0.6px;font-weight:bold;color:#FFFFFF;mso-line-height-rule:exactly;line-height:40px">Agenda, sorties,<br/>bons plans</div>
            <div style="padding-top:12px;font-family:${TEXTE};font-size:15px;color:#DCEAE1;mso-line-height-rule:exactly;line-height:21px">Le programme de la semaine</div>
            <div style="padding-top:8px;font-family:${TEXTE};font-size:11px;font-weight:bold;letter-spacing:1.8px;text-transform:uppercase;color:#E8C58A;mso-line-height-rule:exactly;line-height:16px">Du ${esc(semaineLibelle.replace(/^Semaine du /, ''))}</div>
          </td></tr></table>
        </td></tr>
        <tr><td height="16" style="height:16px;font-size:0;line-height:0">&nbsp;</td></tr>
      </table>`

    /** Le mot d'intro, précédé du bonjour nominatif. */
    case 'text':
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:6px 0"><tr><td>
        <p style="margin:0 0 12px;font-family:${TEXTE};font-size:15px;color:#2C1810;mso-line-height-rule:exactly;line-height:24px">Bonjour${MARQUE_PRENOM},</p>
        ${textHtml(b.texte)}
      </td></tr></table>`

    case 'button':
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:14px 0"><tr><td>${bouton(b.href, esc(b.label))}</td></tr></table>`

    case 'image':
      return b.url ? `<img src="${esc(b.url)}" alt="" width="514" style="display:block;width:100%;border-radius:12px;margin:10px 0;border:0"/>` : ''

    case 'separator':
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td height="1" bgcolor="#EAE2D6" style="height:1px;font-size:0;line-height:0;margin:20px 0">&nbsp;</td></tr></table>`

    /**
     * LA PIÈCE MAÎTRESSE — le décompte de la semaine.
     *
     * Trois étages : bandeau photo avec le grand chiffre, tuiles par
     * catégorie, bouton et date.
     *
     * La photo est assombrie À L'EXPORT, pas par un calque : en email on ne
     * superpose rien, et le texte blanc doit rester lisible même si le client
     * bloque les images de fond — d'où aussi le `bgcolor` de repli et le bloc
     * VML pour Outlook, qui ignore `background-image`.
     *
     * La pastille porte `b.titre` : elle REMPLACE `sectionHeader()`, on ne
     * rend jamais les deux.
     */
    case 'semaine': {
      const s = await getSemaineChiffres()
      if (s.total === 0) return ''

      const tuiles = s.categories.slice(0, 8).map(c => {
        const cat = c.id as Categorie
        return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#FFFFFF" style="background-color:#FFFFFF;border:1px solid #EFE7DA;border-radius:14px">
          <tr><td align="center" style="padding:12px 4px 11px">
            <img src="${ICON_BASE}${ICONE[cat] ?? 'autre'}.png" width="38" height="38" alt="" style="display:block;margin:0 auto 3px;width:38px;height:38px;border:0"/>
            <div style="padding-top:5px;font-family:${TITRE};font-size:22px;letter-spacing:-0.6px;font-weight:bold;color:#1A1209;mso-line-height-rule:exactly;line-height:24px">${c.n}</div>
            <div style="padding-top:1px;font-family:${TEXTE};font-size:11px;color:#7A6A5A;mso-line-height-rule:exactly;line-height:15px">${esc(LIBELLES_NL[cat] ?? c.label)}</div>
          </td></tr></table>`
      })

      let lignes = ''
      for (let i = 0; i < tuiles.length; i += 4) {
        const rang = tuiles.slice(i, i + 4)
        const bas = i + 4 >= tuiles.length ? '0' : '8px'
        lignes += '<tr>' + rang.map((t, j) => {
          const pad = j === 0 ? `0 4px ${bas} 0` : j === rang.length - 1 ? `0 0 ${bas} 4px` : `0 4px ${bas}`
          return `<td width="25%" valign="top" style="padding:${pad}">${t}</td>`
        }).join('') + '</tr>'
      }

      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:14px 0"><tr><td>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#FDF9F1" style="background-color:#FDF9F1;border-radius:20px">

          <tr><td background="${IMAGE_SEMAINE}" bgcolor="#3B5B44" valign="top" style="background-color:#3B5B44;background-image:url('${IMAGE_SEMAINE}');background-position:center center;background-size:cover;background-repeat:no-repeat;border-radius:20px 20px 0 0">
            <!--[if gte mso 9]><v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:514px;height:250px"><v:fill type="frame" src="${IMAGE_SEMAINE}" color="#3B5B44"/><v:textbox inset="0,0,0,0"><![endif]-->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td align="center" style="padding:18px 20px 24px">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td align="center" style="border:1px solid rgba(255,255,255,.55);border-radius:999px;padding:7px 16px;font-family:${TEXTE};font-size:10px;font-weight:bold;letter-spacing:1.6px;text-transform:uppercase;color:#FFFFFF;mso-line-height-rule:exactly;line-height:13px">${esc(b.titre)}</td></tr></table>
              <div style="padding-top:16px;font-family:${TITRE};font-size:104px;letter-spacing:-3px;font-weight:bold;color:#FFFFFF;mso-line-height-rule:exactly;line-height:100px">${s.total}</div>
              <div style="font-family:${TITRE};font-size:32px;letter-spacing:-0.6px;font-weight:bold;color:#FFFFFF;mso-line-height-rule:exactly;line-height:38px">rendez-vous</div>
              <div style="padding-top:4px;font-family:${TEXTE};font-size:14px;font-weight:bold;color:#FFFFFF;mso-line-height-rule:exactly;line-height:20px">&agrave; moins de 35 km</div>
              <div style="padding-top:14px;font-family:${SCRIPT};font-size:24px;font-style:italic;color:#FFFFFF;mso-line-height-rule:exactly;line-height:30px">Le coin bouge !</div>
            </td></tr></table>
            <!--[if gte mso 9]></v:textbox></v:rect><![endif]-->
          </td></tr>

          <tr><td style="padding:14px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${lignes}</table></td></tr>

          <tr><td style="padding:2px 14px 0">${bouton(s.href, 'Voir tout l&rsquo;agenda de la semaine &rarr;')}</td></tr>
          <tr><td align="center" style="padding:14px 14px 16px;font-family:${TEXTE};font-size:11.5px;color:#6B5C4C;mso-line-height-rule:exactly;line-height:16px">${esc(s.libelle)}</td></tr>
        </table>
      </td></tr></table>`
    }

    case 'journal': {
      const items = await getContent('journal', 1, [])
      if (!items.length) return ''
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:14px 0"><tr><td>${sectionHeader(b.titre)}</td></tr><tr><td>${journalCard(items[0])}</td></tr></table>`
    }

    case 'article': {
      const items = await getContent('article', 0, b.ids)
      if (!items.length) return ''
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:14px 0"><tr><td>${sectionHeader(b.titre, SEE_ALL.article)}</td></tr><tr><td>${items.map(articleCard).join('')}</td></tr></table>`
    }

    case 'events':
    case 'promos':
    case 'annonces':
    case 'partenaires': {
      const ids = 'ids' in b ? b.ids : []
      const count = 'count' in b ? b.count : 4
      const items = await getContent(b.type, count, ids)
      if (items.length === 0) return ''
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:14px 0"><tr><td>${sectionHeader(b.titre, SEE_ALL[b.type])}</td></tr><tr><td>${grid(items)}</td></tr></table>`
    }
  }
}

/**
 * Le pré-entête : ce que la boîte mail montre à côté de l'objet.
 *
 * Sans lui, Gmail affiche le début du corps — soit « Sud Cévennes La Place du
 * Village ». Une ligne qui ne dit rien à l'endroit qui décide de l'ouverture.
 */
async function preEntete(blocks: NewsletterBlock[]): Promise<string> {
  const bouts: string[] = []
  if (blocks.some(b => b.type === 'semaine')) {
    const s = await getSemaineChiffres().catch(() => null)
    if (s?.total) bouts.push(`${s.total} rendez-vous près de chez vous`)
  }
  if (blocks.some(b => b.type === 'journal' || b.type === 'article')) bouts.push('le Journal')
  if (blocks.some(b => b.type === 'promos')) bouts.push('les offres du village')
  return bouts.length ? `Le programme de la semaine : ${bouts.join(', ')}.` : 'Le programme de la semaine.'
}

export async function renderNewsletterBody(blocks: NewsletterBlock[]): Promise<string> {
  const sem = await getSemaineChiffres().catch(() => null)
  const libelle = sem?.libelle ?? ''
  const [entete, ...parts] = await Promise.all([
    preEntete(blocks),
    ...blocks.map(b => renderBlock(b, libelle)),
  ])
  const cache = `<span class="ph" style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;max-height:0;max-width:0;overflow:hidden;mso-hide:all">${esc(entete)}</span>`
  return cache + '\n' + (parts as string[]).join('\n')
}

/** Mail d'invitation aux non-abonnés : en-tête + mot + (bouton ajouté ensuite). */
export function renderInviteBody(invite: { titre: string; message: string; imageUrl?: string | null }): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td align="center">
    ${invite.imageUrl ? `<img src="${esc(invite.imageUrl)}" alt="" width="514" style="display:block;width:100%;border-radius:12px;margin-bottom:16px;border:0"/>` : ''}
    <div style="font-family:${TITRE};font-size:24px;letter-spacing:-0.6px;font-weight:bold;color:#2D5A3D;margin-bottom:10px;mso-line-height-rule:exactly;line-height:30px">${esc(invite.titre || 'La Place du Village')}</div>
    <div style="text-align:left">${textHtml(invite.message || '')}</div>
  </td></tr></table>`
}

/** L'enveloppe : fond crème, carte blanche, pied hors de la carte. */
export function wrapNewsletter(innerHtml: string, footerHtml: string): string {
  return `<!DOCTYPE html><html lang="fr" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<meta name="color-scheme" content="light dark"/>
<meta name="supported-color-schemes" content="light dark"/>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>
a{text-decoration:none}
@media only screen and (max-width:600px){
.w{width:100%!important}
.p{padding-left:16px!important;padding-right:16px!important}
.col{display:block!important;width:100%!important;max-width:100%!important;padding:0 0 8px 0!important}
}
</style>
</head>
<body style="margin:0;padding:0;background-color:#FBF7F0;-webkit-font-smoothing:antialiased">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#FBF7F0"><tr><td align="center" style="padding:20px 16px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" class="w" style="width:560px;max-width:560px">
<tr><td bgcolor="#FFFFFF" style="background-color:#FFFFFF;border:1px solid #EAE2D6;border-radius:16px;padding:22px" class="p">
${innerHtml}
</td></tr>
<tr><td align="center" style="padding:16px 8px" class="p">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr><td align="center" style="font-family:${TEXTE};font-size:11px;font-weight:bold;mso-line-height-rule:exactly;line-height:18px"><a href="${SITE}" style="color:#2D5A3D;text-decoration:none">La Place du Village</a></td></tr>
<tr><td align="center" style="font-family:${TEXTE};font-size:11px;color:#6B5C4C;mso-line-height-rule:exactly;line-height:18px">${footerHtml}</td></tr>
</table>
</td></tr>
</table>
</td></tr></table>
</body></html>`
}
