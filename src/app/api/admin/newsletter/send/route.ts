import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/server-auth'
import { sendBatch, renderEmail, textToHtml } from '@/lib/email'

const SITE = 'https://laplaceduvillage.app'

/**
 * POST /api/admin/newsletter/send
 * Body : { audience: 'subscribers' | 'non_subscribers', subject, message }
 *  - subscribers     : envoie la newsletter aux abonnés (+ lien désabonnement).
 *  - non_subscribers : envoie une invitation à s'abonner (+ bouton 1-clic) et
 *                      tamponne newsletter_invited_at.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const { audience, subject, message } = await req.json().catch(() => ({}))
  if (audience !== 'subscribers' && audience !== 'non_subscribers') {
    return NextResponse.json({ error: 'audience invalide' }, { status: 400 })
  }
  if (!subject?.trim() || !message?.trim()) {
    return NextResponse.json({ error: 'Sujet et message requis' }, { status: 400 })
  }
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'Service email non configuré (RESEND_API_KEY)' }, { status: 503 })
  }

  const optin = audience === 'subscribers'
  const { data: recips } = await supabaseAdmin
    .from('profiles')
    .select('email, display_name, newsletter_token')
    .eq('newsletter_optin', optin)
    .not('email', 'is', null)

  const body = textToHtml(message)
  const mails = (recips ?? [])
    .filter(r => r.email)
    .map(r => {
      if (optin) {
        const unsub = `${SITE}/newsletter?token=${r.newsletter_token}&a=unsubscribe`
        return {
          to: r.email as string,
          subject,
          html: renderEmail({ titre: subject, bodyHtml: body, footerHtml: `Tu reçois cet email car tu es abonné·e à la newsletter de La Place du Village.<br/><a href="${unsub}" style="color:#9A8A7A">Se désabonner en un clic</a>` }),
        }
      }
      const sub = `${SITE}/newsletter?token=${r.newsletter_token}&a=subscribe`
      return {
        to: r.email as string,
        subject,
        html: renderEmail({ titre: subject, bodyHtml: body, cta: { href: sub, label: 'Je m’abonne à la newsletter' }, footerHtml: `Tu reçois ce message car tu as un compte La Place du Village. Si tu ne souhaites pas recevoir la newsletter, ignore simplement cet email.` }),
      }
    })

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
