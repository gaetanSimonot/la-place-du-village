/**
 * Envoi d'emails via Resend (REST API, pas de dépendance npm).
 * Nécessite l'env var RESEND_API_KEY (Vercel).
 * Expéditeur sur le domaine vérifié laplaceduvillage.app.
 */

const FROM = process.env.NEWSLETTER_FROM ?? 'La Place du Village <lettre@laplaceduvillage.app>'
const SITE = 'https://laplaceduvillage.app'

interface Mail { to: string; subject: string; html: string; headers?: Record<string, string> }

/** Envoie un email unique. Retourne { ok, error? }. */
/**
 * Le STATUT remonte avec l'échec, et ce n'est pas un détail.
 *
 * Une file d'envoi doit distinguer deux échecs qui n'ont rien à voir :
 * le quota atteint (429) ou un service en panne (5xx), où il faut S'ARRÊTER
 * et reprendre plus tard ; et une adresse que le service refuse (4xx), où il
 * faut PASSER AU SUIVANT. Sans ce statut, on ne peut que tout arrêter — et
 * une seule mauvaise adresse bloquait la lettre pour vingt-quatre heures.
 *
 * `0` = rien n'est parti (pas de clé, réseau coupé) : c'est un arrêt.
 */
export async function sendEmail(mail: Mail): Promise<{ ok: boolean; error?: string; statut?: number }> {
  const key = process.env.RESEND_API_KEY
  if (!key) return { ok: false, error: 'RESEND_API_KEY manquante', statut: 0 }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: mail.to, subject: mail.subject, html: mail.html, ...(mail.headers ? { headers: mail.headers } : {}) }),
    })
    if (!r.ok) return { ok: false, error: (await r.text().catch(() => '')).slice(0, 200), statut: r.status }
    return { ok: true, statut: r.status }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur réseau', statut: 0 }
  }
}

/**
 * Faut-il arrêter toute la file, ou seulement passer cette adresse ?
 *
 * On s'arrête sur ce qui est temporaire et global — quota, panne, réseau.
 * On passe sur ce qui ne concerne qu'un destinataire : réessayer cent fois
 * une adresse invalide ne la rendra pas valide, et pendant ce temps les
 * autres attendent.
 */
export function arreterLaFile(statut?: number): boolean {
  if (statut === undefined) return true
  if (statut === 429 || statut >= 500 || statut === 0) return true
  return false
}

/**
 * Envoie une liste d'emails par lots (Resend batch = 100 max par requête).
 * Retourne le nombre envoyé. Fail-soft : un lot en erreur n'arrête pas le reste.
 */
export async function sendBatch(mails: Mail[]): Promise<{ sent: number; error?: string }> {
  const key = process.env.RESEND_API_KEY
  if (!key) return { sent: 0, error: 'RESEND_API_KEY manquante' }
  let sent = 0
  for (let i = 0; i < mails.length; i += 100) {
    const chunk = mails.slice(i, i + 100).map(m => ({ from: FROM, to: m.to, subject: m.subject, html: m.html, ...(m.headers ? { headers: m.headers } : {}) }))
    try {
      const r = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk),
      })
      if (r.ok) sent += chunk.length
    } catch { /* lot ignoré */ }
  }
  return { sent }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Transforme un texte saisi (lignes) en HTML simple (paragraphes). */
export function textToHtml(text: string): string {
  return text.split(/\n{2,}/).map(p => `<p style="margin:0 0 14px;line-height:1.6">${esc(p).replace(/\n/g, '<br/>')}</p>`).join('')
}

/**
 * Bouton d'action, rendu en table pour survivre aux clients mail anciens.
 * Exposé à part : un message peut en contenir plusieurs, là où `renderEmail`
 * n'en place qu'un seul en pied de contenu.
 */
export function boutonEmail(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0"><tr><td style="border-radius:12px;background:#2D5A3D"><a href="${href}" style="display:inline-block;padding:13px 26px;color:#fff;font-weight:800;text-decoration:none;border-radius:12px">${esc(label)}</a></td></tr></table>`
}

/** Gabarit HTML d'un email (entête village + contenu + CTA optionnel + footer). */
export function renderEmail(opts: { titre?: string; bodyHtml: string; cta?: { href: string; label: string }; footerHtml?: string }): string {
  const cta = opts.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0"><tr><td style="border-radius:12px;background:#2D5A3D"><a href="${opts.cta.href}" style="display:inline-block;padding:13px 26px;color:#fff;font-weight:800;text-decoration:none;border-radius:12px">${esc(opts.cta.label)}</a></td></tr></table>`
    : ''
  return `<!DOCTYPE html><html><body style="margin:0;background:#FBF7F0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2C1810">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px">
    <div style="text-align:center;padding:6px 0 18px">
      <a href="${SITE}" style="font-size:20px;font-weight:800;color:#2D5A3D;text-decoration:none">La Place du Village</a>
    </div>
    <div style="background:#fff;border:1px solid #EAE2D6;border-radius:16px;padding:24px">
      ${opts.titre ? `<h1 style="margin:0 0 14px;font-size:20px;color:#1A1209">${esc(opts.titre)}</h1>` : ''}
      ${opts.bodyHtml}
      ${cta}
    </div>
    <div style="text-align:center;font-size:11px;color:#9A8A7A;padding:16px 8px;line-height:1.6">
      ${opts.footerHtml ?? ''}
    </div>
  </div></body></html>`
}
