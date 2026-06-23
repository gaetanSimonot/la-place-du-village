/**
 * Rendu email (HTML) d'une newsletter par blocs. Côté serveur : les blocs
 * "contenu" tirent les données fraîches du site (src/lib/newsletterContent).
 */
import type { NewsletterBlock, ContentItem } from '@/lib/newsletterBlocks'
import { getContent } from '@/lib/newsletterContent'

const SITE = 'https://laplaceduvillage.app'
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const textHtml = (t: string) => t.split(/\n{2,}/).map(p => `<p style="margin:0 0 12px;line-height:1.6;font-size:15px;color:#2C1810">${esc(p).replace(/\n/g, '<br/>')}</p>`).join('')

function itemCard(it: ContentItem): string {
  return `<a href="${esc(it.href)}" style="display:block;text-decoration:none;color:#1A1209;border:1px solid #EAE2D6;border-radius:12px;overflow:hidden;margin:0 0 10px">
    ${it.image ? `<img src="${esc(it.image)}" alt="" width="528" style="display:block;width:100%;max-height:200px;object-fit:cover"/>` : ''}
    <div style="padding:12px 14px">
      <div style="font-weight:800;font-size:15px;color:#1A1209">${esc(it.title)}</div>
      ${it.sub ? `<div style="font-size:12.5px;color:#7A6A5A;margin-top:3px">${esc(it.sub)}</div>` : ''}
    </div>
  </a>`
}

function sectionTitle(t: string): string {
  return `<div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#C4622D;margin:18px 0 10px">${esc(t)}</div>`
}

async function renderBlock(b: NewsletterBlock): Promise<string> {
  switch (b.type) {
    case 'header':
      return `<div style="text-align:center;margin:0 0 8px">
        ${b.imageUrl ? `<img src="${esc(b.imageUrl)}" alt="" width="528" style="display:block;width:100%;border-radius:12px;margin-bottom:14px"/>` : ''}
        <div style="font-family:Georgia,serif;font-size:26px;font-weight:800;color:#2D5A3D">${esc(b.titre)}</div>
        ${b.sousTitre ? `<div style="font-size:14px;color:#7A6A5A;margin-top:4px">${esc(b.sousTitre)}</div>` : ''}
      </div>`
    case 'text':
      return `<div style="margin:6px 0">${textHtml(b.texte)}</div>`
    case 'button':
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px auto"><tr><td style="border-radius:12px;background:#2D5A3D"><a href="${esc(b.href)}" style="display:inline-block;padding:13px 26px;color:#fff;font-weight:800;text-decoration:none;border-radius:12px">${esc(b.label)}</a></td></tr></table>`
    case 'image':
      return b.url ? `<img src="${esc(b.url)}" alt="" width="528" style="display:block;width:100%;border-radius:12px;margin:10px 0"/>` : ''
    case 'separator':
      return `<hr style="border:none;border-top:1px solid #EAE2D6;margin:18px 0"/>`
    case 'events':
    case 'promos':
    case 'annonces':
    case 'journal':
    case 'partenaires': {
      const ids = b.type === 'partenaires' ? b.ids : []
      const count = 'count' in b ? b.count : 1
      const items = await getContent(b.type, count, ids)
      if (items.length === 0) return ''
      return sectionTitle(b.titre) + items.map(itemCard).join('')
    }
  }
}

/** Rend le corps (blocs) en HTML. */
export async function renderNewsletterBody(blocks: NewsletterBlock[]): Promise<string> {
  const parts = await Promise.all(blocks.map(renderBlock))
  return parts.join('\n')
}

/** Gabarit complet (entête village minimal + corps + footer). */
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
