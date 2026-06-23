/**
 * Rendu email (HTML) de la newsletter par blocs + du mail d'invitation.
 * Côté serveur : les blocs "contenu" tirent les données fraîches du site.
 */
import type { NewsletterBlock, ContentItem } from '@/lib/newsletterBlocks'
import { getContent } from '@/lib/newsletterContent'

const SITE = 'https://laplaceduvillage.app'
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const textHtml = (t: string) => t.split(/\n{2,}/).map(p => `<p style="margin:0 0 12px;line-height:1.6;font-size:15px;color:#2C1810">${esc(p).replace(/\n/g, '<br/>')}</p>`).join('')

const SEE_ALL: Record<string, string> = {
  events: `${SITE}/agenda`, promos: `${SITE}/promotions`, annonces: `${SITE}/annonces`, partenaires: `${SITE}/annuaire`,
}

function sectionHeader(titre: string, seeAllHref?: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 12px"><tr>
    <td style="font-size:13px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#C4622D">${esc(titre)}</td>
    ${seeAllHref ? `<td align="right" style="font-size:12px;font-weight:700"><a href="${seeAllHref}" style="color:#2D5A3D;text-decoration:none">Voir tout →</a></td>` : ''}
  </tr></table>`
}

function gridCard(it: ContentItem): string {
  return `<a href="${esc(it.href)}" style="display:block;text-decoration:none;color:#1A1209;border:1px solid #EAE2D6;border-radius:10px;overflow:hidden">
    ${it.image ? `<img src="${esc(it.image)}" alt="" width="260" style="display:block;width:100%;height:104px;object-fit:cover"/>` : `<div style="height:104px;background:#F2ECE2"></div>`}
    <div style="padding:8px 10px">
      <div style="font-weight:700;font-size:13px;line-height:1.25;color:#1A1209">${esc(it.title)}</div>
      ${it.sub ? `<div style="font-size:11px;color:#7A6A5A;margin-top:2px">${esc(it.sub)}</div>` : ''}
    </div>
  </a>`
}

function grid(items: ContentItem[]): string {
  let rows = ''
  for (let i = 0; i < items.length; i += 2) {
    const a = items[i], b = items[i + 1]
    rows += `<tr>
      <td width="50%" valign="top" style="padding:0 4px 8px 0">${gridCard(a)}</td>
      <td width="50%" valign="top" style="padding:0 0 8px 4px">${b ? gridCard(b) : ''}</td>
    </tr>`
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`
}

function journalCard(it: ContentItem): string {
  return `<a href="${esc(it.href)}" style="display:block;text-decoration:none;color:#fff;border-radius:14px;overflow:hidden;background:#1A1209">
    ${it.image ? `<img src="${esc(it.image)}" alt="" width="528" style="display:block;width:100%;max-height:240px;object-fit:cover"/>` : ''}
    <div style="padding:16px 18px">
      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#E8C58A">${esc(it.sub ?? 'Le Journal du Village')}</div>
      <div style="font-family:Georgia,serif;font-size:21px;font-weight:700;margin:4px 0 12px">${esc(it.title)}</div>
      <span style="display:inline-block;padding:10px 20px;background:#E8C58A;color:#1A1209;font-weight:800;font-size:13px;border-radius:10px">Lire le Journal →</span>
    </div>
  </a>`
}

async function renderBlock(b: NewsletterBlock): Promise<string> {
  switch (b.type) {
    case 'header':
      return `<div style="text-align:center;margin:0 0 14px">
        ${b.imageUrl ? `<img src="${esc(b.imageUrl)}" alt="" width="528" style="display:block;width:100%;border-radius:12px;margin-bottom:14px"/>` : ''}
        <div style="font-family:Georgia,serif;font-size:26px;font-weight:800;color:#2D5A3D">${esc(b.titre)}</div>
        ${b.sousTitre ? `<div style="font-size:14px;color:#7A6A5A;margin-top:4px">${esc(b.sousTitre)}</div>` : ''}
      </div>`
    case 'text':       return `<div style="margin:6px 0">${textHtml(b.texte)}</div>`
    case 'button':     return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px auto"><tr><td style="border-radius:12px;background:#2D5A3D"><a href="${esc(b.href)}" style="display:inline-block;padding:13px 26px;color:#fff;font-weight:800;text-decoration:none;border-radius:12px">${esc(b.label)}</a></td></tr></table>`
    case 'image':      return b.url ? `<img src="${esc(b.url)}" alt="" width="528" style="display:block;width:100%;border-radius:12px;margin:10px 0"/>` : ''
    case 'separator':  return `<hr style="border:none;border-top:1px solid #EAE2D6;margin:20px 0"/>`
    case 'journal': {
      const items = await getContent('journal', 1, [])
      if (!items.length) return ''
      return `<div style="margin:14px 0">${sectionHeader(b.titre)}${journalCard(items[0])}</div>`
    }
    case 'events':
    case 'promos':
    case 'annonces':
    case 'partenaires': {
      const ids = b.type === 'partenaires' ? b.ids : (b.mode === 'manual' ? b.ids : [])
      const count = 'count' in b ? b.count : 4
      const items = await getContent(b.type, count, ids)
      if (items.length === 0) return ''
      return `<div style="margin:14px 0">${sectionHeader(b.titre, SEE_ALL[b.type])}${grid(items)}</div>`
    }
  }
}

export async function renderNewsletterBody(blocks: NewsletterBlock[]): Promise<string> {
  const parts = await Promise.all(blocks.map(renderBlock))
  return parts.join('\n')
}

/** Mail d'invitation aux non-abonnés : en-tête + mot + (bouton ajouté ensuite). */
export function renderInviteBody(invite: { titre: string; message: string; imageUrl?: string | null }): string {
  return `<div style="text-align:center">
    ${invite.imageUrl ? `<img src="${esc(invite.imageUrl)}" alt="" width="528" style="display:block;width:100%;border-radius:12px;margin-bottom:16px"/>` : ''}
    <div style="font-family:Georgia,serif;font-size:24px;font-weight:800;color:#2D5A3D;margin-bottom:10px">${esc(invite.titre || 'La Place du Village')}</div>
    <div style="text-align:left">${textHtml(invite.message || '')}</div>
  </div>`
}

export function wrapNewsletter(innerHtml: string, footerHtml: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;background:#FBF7F0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2C1810">
  <div style="max-width:560px;margin:0 auto;padding:20px 16px">
    <div style="background:#fff;border:1px solid #EAE2D6;border-radius:16px;padding:22px">
      ${innerHtml}
    </div>
    <div style="text-align:center;font-size:11px;color:#9A8A7A;padding:16px 8px;line-height:1.6">
      <a href="${SITE}" style="color:#2D5A3D;text-decoration:none;font-weight:700">La Place du Village</a><br/>
      ${footerHtml}
    </div>
  </div></body></html>`
}
