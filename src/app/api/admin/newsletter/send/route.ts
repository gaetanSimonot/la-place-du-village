import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/server-auth'
import { sendBatch, textToHtml } from '@/lib/email'
import { renderNewsletterBody, wrapNewsletter } from '@/lib/newsletterRender'
import type { NewsletterBlock } from '@/lib/newsletterBlocks'

const SITE = 'https://laplaceduvillage.app'

const subscribeButton = (token: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px auto"><tr><td style="border-radius:12px;background:#E8622A"><a href="${SITE}/newsletter?token=${token}&a=subscribe" style="display:inline-block;padding:14px 28px;color:#fff;font-weight:800;text-decoration:none;border-radius:12px">Je m’abonne à la newsletter</a></td></tr></table>`

/**
 * POST /api/admin/newsletter/send
 * Body : { audience: 'subscribers' | 'non_subscribers', subject, blocks?, message? }
 *  - blocks  : newsletter par sections (rendu serveur, données fraîches du site).
 *  - message : fallback texte simple.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const { audience, subject, blocks, message } = await req.json().catch(() => ({}))
  if (audience !== 'subscribers' && audience !== 'non_subscribers') {
    return NextResponse.json({ error: 'audience invalide' }, { status: 400 })
  }
  if (!subject?.trim()) return NextResponse.json({ error: 'Sujet requis' }, { status: 400 })
  const hasBlocks = Array.isArray(blocks) && blocks.length > 0
  if (!hasBlocks && !message?.trim()) return NextResponse.json({ error: 'Contenu requis' }, { status: 400 })
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'Service email non configuré (RESEND_API_KEY)' }, { status: 503 })
  }

  // Corps commun à tous les destinataires (rendu une seule fois).
  const body = hasBlocks ? await renderNewsletterBody(blocks as NewsletterBlock[]) : textToHtml(String(message))

  const optin = audience === 'subscribers'

  // Destinataires avec compte
  const { data: recips } = await supabaseAdmin
    .from('profiles')
    .select('email, newsletter_token')
    .eq('newsletter_optin', optin)
    .not('email', 'is', null)

  const mails: { to: string; subject: string; html: string }[] = []

  ;(recips ?? []).forEach(r => {
    if (!r.email) return
    if (optin) {
      const unsub = `${SITE}/newsletter?token=${r.newsletter_token}&a=unsubscribe`
      mails.push({ to: r.email, subject, html: wrapNewsletter(body, `Tu reçois cet email car tu es abonné·e.<br/><a href="${unsub}" style="color:#9A8A7A">Se désabonner en un clic</a>`) })
    } else {
      mails.push({ to: r.email, subject, html: wrapNewsletter(body + subscribeButton(String(r.newsletter_token)), `Tu reçois ce message car tu as un compte La Place du Village. Pour recevoir la newsletter chaque semaine, clique ci-dessus.`) })
    }
  })

  // Abonnés ajoutés à la main (sans compte) — uniquement liste "abonnés"
  if (optin) {
    const { data: extra } = await supabaseAdmin.from('newsletter_extra_emails').select('email, token')
    ;(extra ?? []).forEach(x => {
      const unsub = `${SITE}/newsletter?token=${x.token}&a=unsubscribe`
      mails.push({ to: x.email as string, subject, html: wrapNewsletter(body, `Tu reçois cet email car tu es abonné·e.<br/><a href="${unsub}" style="color:#9A8A7A">Se désabonner en un clic</a>`) })
    })
  }

  if (mails.length === 0) return NextResponse.json({ sent: 0, total: 0 })

  const { sent, error } = await sendBatch(mails)
  if (error) return NextResponse.json({ error }, { status: 500 })

  if (!optin) {
    await supabaseAdmin.from('profiles')
      .update({ newsletter_invited_at: new Date().toISOString() })
      .eq('newsletter_optin', false).not('email', 'is', null)
  }

  return NextResponse.json({ sent, total: mails.length })
}
