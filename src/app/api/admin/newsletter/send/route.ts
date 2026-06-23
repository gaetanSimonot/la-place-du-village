import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/server-auth'
import { sendBatch } from '@/lib/email'
import { renderNewsletterBody, renderInviteBody, wrapNewsletter } from '@/lib/newsletterRender'
import { setCurrentEdition, welcomeBacklog, DAILY_LIMIT } from '@/lib/newsletterWelcome'
import type { NewsletterBlock } from '@/lib/newsletterBlocks'

const SITE = 'https://laplaceduvillage.app'
const subscribeButton = (token: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px auto"><tr><td style="border-radius:12px;background:#E8622A"><a href="${SITE}/newsletter?token=${token}&a=subscribe" style="display:inline-block;padding:14px 28px;color:#fff;font-weight:800;text-decoration:none;border-radius:12px">Je m’abonne à la newsletter</a></td></tr></table>`

/**
 * POST /api/admin/newsletter/send  { audience, subject, blocks?, invite? }
 *  - subscribers     → dépose l'« édition active » et l'envoie en FILE D'ATTENTE
 *    étalée (Resend gratuit = 100/jour) : 1er lot tout de suite, le reste par le
 *    cron quotidien /api/cron/newsletter-welcome. Les nouveaux abonnés la
 *    reçoivent aussi automatiquement.
 *  - non_subscribers → mail d'invitation simple (envoi direct, unique).
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

  // ── Abonnés : file d'attente étalée ────────────────────────────────────
  if (audience === 'subscribers') {
    if (!(Array.isArray(blocks) && blocks.length)) {
      return NextResponse.json({ error: 'Ajoute au moins une section' }, { status: 400 })
    }
    const body = await renderNewsletterBody(blocks as NewsletterBlock[])
    await setCurrentEdition(subject, body)            // devient l'édition active
    const sent = await welcomeBacklog(DAILY_LIMIT)    // 1er lot immédiat

    const [profCount, extraCount] = await Promise.all([
      supabaseAdmin.from('profiles').select('user_id', { count: 'exact', head: true }).eq('newsletter_optin', true).not('email', 'is', null),
      supabaseAdmin.from('newsletter_extra_emails').select('id', { count: 'exact', head: true }),
    ])
    const total = (profCount.count ?? 0) + (extraCount.count ?? 0)
    return NextResponse.json({ queued: true, sent, total, perDay: DAILY_LIMIT })
  }

  // ── Non-abonnés : invitation directe ───────────────────────────────────
  if (!invite?.message?.trim()) {
    return NextResponse.json({ error: 'Écris le message d’invitation' }, { status: 400 })
  }
  const body = renderInviteBody(invite)
  const { data: recips } = await supabaseAdmin
    .from('profiles').select('email, newsletter_token').eq('newsletter_optin', false).not('email', 'is', null)
  const mails = (recips ?? []).filter(r => r.email).map(r => ({
    to: r.email as string,
    subject,
    html: wrapNewsletter(body + subscribeButton(String(r.newsletter_token)), 'Tu reçois ce message car tu as un compte La Place du Village.'),
  }))
  if (mails.length === 0) return NextResponse.json({ sent: 0, total: 0 })

  const { sent, error } = await sendBatch(mails)
  if (error) return NextResponse.json({ error }, { status: 500 })
  await supabaseAdmin.from('profiles').update({ newsletter_invited_at: new Date().toISOString() }).eq('newsletter_optin', false).not('email', 'is', null)
  return NextResponse.json({ sent, total: mails.length })
}
