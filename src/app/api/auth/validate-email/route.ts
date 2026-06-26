import { NextRequest, NextResponse } from 'next/server'
import { promises as dns } from 'dns'

export const runtime = 'nodejs'

/**
 * POST /api/auth/validate-email { email } → { valid, reason? }
 *
 * Filtre INVISIBLE à l'inscription (zéro friction, pas de confirmation par mail) :
 *  1. format,
 *  2. domaines jetables (temp-mail),
 *  3. le domaine peut-il recevoir des emails ? (MX, sinon A en secours).
 * Ne garantit pas la possession de l'adresse (impossible sans confirmation),
 * mais bloque l'essentiel du junk.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Domaines jetables courants (liste volontairement courte/maintenable).
const DISPOSABLE = new Set([
  'mailinator.com', 'yopmail.com', 'yopmail.fr', 'yopmail.net', 'guerrillamail.com',
  'guerrillamail.net', 'sharklasers.com', 'grr.la', 'spam4.me', '10minutemail.com',
  'tempmail.com', 'temp-mail.org', 'tempmail.net', 'tempr.email', 'trashmail.com',
  'getnada.com', 'nada.email', 'dispostable.com', 'maildrop.cc', 'mailnesia.com',
  'mintemail.com', 'throwawaymail.com', 'fakeinbox.com', 'mohmal.com', 'emailondeck.com',
  'spambog.com', 'mailcatch.com', 'jetable.org', 'tempinbox.com', 'discard.email',
  '33mail.com', 'moakt.com', 'mailto.plus', 'fakemail.net', 'maileater.com',
])

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const e = String(body?.email ?? '').trim().toLowerCase()

  if (!EMAIL_RE.test(e)) {
    return NextResponse.json({ valid: false, reason: 'Adresse email invalide.' })
  }
  const domain = e.split('@')[1]
  if (DISPOSABLE.has(domain)) {
    return NextResponse.json({ valid: false, reason: 'Les adresses jetables ne sont pas acceptées.' })
  }

  // Le domaine peut-il recevoir des emails ? MX d'abord, A/AAAA en secours
  // (certains domaines légitimes n'ont pas de MX mais reçoivent via A).
  try {
    const mx = await dns.resolveMx(domain)
    if (mx && mx.length > 0) return NextResponse.json({ valid: true })
  } catch { /* pas de MX → on tente A */ }
  try {
    const a = await dns.resolve(domain)
    if (a && a.length > 0) return NextResponse.json({ valid: true })
  } catch { /* rien */ }

  return NextResponse.json({ valid: false, reason: 'Ce domaine email n’existe pas.' })
}
