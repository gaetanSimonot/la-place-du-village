import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'
import { renderNewsletterBody, renderInviteBody, wrapNewsletter } from '@/lib/newsletterRender'
import type { NewsletterBlock } from '@/lib/newsletterBlocks'

/**
 * POST /api/admin/newsletter/preview — rend le HTML email exact pour l'aperçu.
 * Body : { mode: 'newsletter' | 'invite', blocks?, invite? }
 */
const SITE = 'https://laplaceduvillage.app'

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const { mode, blocks, invite } = await req.json().catch(() => ({}))

  if (mode === 'invite') {
    const body = renderInviteBody(invite ?? { titre: '', message: '' })
    const cta = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px auto"><tr><td style="border-radius:12px;background:#E8622A"><a href="${SITE}/newsletter?token=APERCU&a=subscribe" style="display:inline-block;padding:14px 28px;color:#fff;font-weight:800;text-decoration:none;border-radius:12px">Je m’abonne à la newsletter</a></td></tr></table>`
    return NextResponse.json({ html: wrapNewsletter(body + cta, 'Aperçu · le lien d’abonnement sera personnalisé pour chaque destinataire.') })
  }

  const body = await renderNewsletterBody((blocks ?? []) as NewsletterBlock[])
  return NextResponse.json({ html: wrapNewsletter(body, 'Aperçu · un lien de désabonnement sera ajouté pour chaque abonné.') })
}
