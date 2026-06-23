import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/server-auth'
import { sendBatch } from '@/lib/email'
import { renderNewsletterBody, renderInviteBody, wrapNewsletter } from '@/lib/newsletterRender'
import { setCurrentEdition } from '@/lib/newsletterWelcome'
import type { NewsletterBlock } from '@/lib/newsletterBlocks'

const SITE = 'https://laplaceduvillage.app'
const subscribeButton = (token: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px auto"><tr><td style="border-radius:12px;background:#E8622A"><a href="${SITE}/newsletter?token=${token}&a=subscribe" style="display:inline-block;padding:14px 28px;color:#fff;font-weight:800;text-decoration:none;border-radius:12px">Je m’abonne à la newsletter</a></td></tr></table>`

/**
 * POST /api/admin/newsletter/send
 * Body : { audience, subject, blocks?, invite? }
 *  - subscribers     → newsletter par blocs (+ lien désabonnement).
 *  - non_subscribers → mail d'invitation simple (en-tête + mot + bouton s'abonner).
 */
export async function POST(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const { audience, subject, blocks, invite } = await req.json().catch(() => ({}))
  if (audience !== 'subscribers' && audience !== 'non_subscribers') {
    return NextResponse.json({ error: 'audience invalide' }, { status: 400 })
  }
  if (!subject?.trim()) return NextResponse.json({ error: 'Sujet requis' }, { status: 400 })
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'Service email non configuré (RESEND_API_KEY)' }, { status: 503 })
  }

  const optin = audience === 'subscribers'

  // Corps commun à tous les destinataires (le bouton/footer varie par personne).
  const body = optin
    ? await renderNewsletterBody((blocks ?? []) as NewsletterBlock[])
    : renderInviteBody(invite ?? { titre: '', message: '' })

  if (optin && !(Array.isArray(blocks) && blocks.length)) {
    return NextResponse.json({ error: 'Ajoute au moins une section' }, { status: 400 })
  }
  if (!optin && !invite?.message?.trim()) {
    return NextResponse.json({ error: 'Écris le message d’invitation' }, { status: 400 })
  }

  const { data: recips } = await supabaseAdmin
    .from('profiles').select('email, newsletter_token').eq('newsletter_optin', optin).not('email', 'is', null)

  const mails: { to: string; subject: string; html: string }[] = []
  ;(recips ?? []).forEach(r => {
    if (!r.email) return
    if (optin) {
      const unsub = `${SITE}/newsletter?token=${r.newsletter_token}&a=unsubscribe`
      mails.push({ to: r.email, subject, html: wrapNewsletter(body, `Tu reçois cet email car tu es abonné·e.<br/><a href="${unsub}" style="color:#9A8A7A">Se désabonner en un clic</a>`) })
    } else {
      mails.push({ to: r.email, subject, html: wrapNewsletter(body + subscribeButton(String(r.newsletter_token)), 'Tu reçois ce message car tu as un compte La Place du Village.') })
    }
  })

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

  if (optin) {
    // Édition active : les nouveaux abonnés la recevront automatiquement.
    // Les abonnés du moment viennent de la recevoir → marqués comme à jour.
    await setCurrentEdition(subject, body)
    const now = new Date().toISOString()
    await supabaseAdmin.from('profiles').update({ newsletter_welcomed_at: now }).eq('newsletter_optin', true).not('email', 'is', null)
    await supabaseAdmin.from('newsletter_extra_emails').update({ welcomed_at: now }).not('email', 'is', null)
  } else {
    await supabaseAdmin.from('profiles').update({ newsletter_invited_at: new Date().toISOString() }).eq('newsletter_optin', false).not('email', 'is', null)
  }
  return NextResponse.json({ sent, total: mails.length })
}
