import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { requireUser } from '@/lib/server-auth'
import { can } from '@/lib/capabilities'
import { generatePoster } from '@/lib/poster/generate.js'
import { BACKGROUNDS, FORMATS } from '@/lib/poster/palettes.js'

// Modules natifs (sharp, resvg) → Node runtime obligatoire.
export const runtime = 'nodejs'
export const maxDuration = 30

// Couleur pleine par défaut si le client n'en fournit pas (option "Fond uni").
const DEFAULT_SOLID = '#1B1C2B'

const solidBg = (hex: string) =>
  sharp({ create: { width: 32, height: 32, channels: 3, background: hex } }).png().toBuffer()

/** data:…base64 → Buffer (le moteur gère aussi les chemins et URLs http). */
function toSource(s?: string | null): Buffer | string | null {
  if (!s) return null
  if (s.startsWith('data:')) return Buffer.from(s.split(',')[1] ?? '', 'base64')
  return s
}

/**
 * POST — génère une affiche d'événement (Partenaire Local / admin).
 * Body : { event: <contrat app>, opts: { template?, format?, random?, useBackgrounds?,
 *          image?(dataURL), logo?(dataURL) } }
 * Réponse : binaire image/png.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx
  if (!can(ctx, 'promo_pro')) {
    return NextResponse.json({ error: 'Réservé aux Partenaires Locaux' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const event = body.event ?? {}
  const opts = body.opts ?? {}

  const o: Record<string, unknown> = { output: 'png' }
  o.image = toSource(opts.image)
  o.logo = toSource(opts.logo)
  o.format = (opts.format && (FORMATS as Record<string, unknown>)[opts.format]) ? opts.format : 'social-portrait'
  if (opts.template) o.template = opts.template

  // Déterministe : tout le hasard est piloté par le CLIENT (template, bgIndex,
  // accent, solidColor). Un même jeu d'opts → même affiche. Changer un seul
  // paramètre n'altère donc pas les autres.
  if (typeof opts.accent === 'string') event.categorie_couleur = opts.accent

  if (opts.solidBg) {
    o.background = await solidBg(typeof opts.solidColor === 'string' ? opts.solidColor : DEFAULT_SOLID)
  } else {
    const pool = Object.values(BACKGROUNDS as Record<string, string>)
    const i = Number.isInteger(opts.bgIndex) ? ((opts.bgIndex % pool.length) + pool.length) % pool.length : 0
    o.background = pool[i]
  }

  try {
    const { png } = await generatePoster(event, o)
    if (!png) throw new Error('Rendu vide')
    return new NextResponse(new Uint8Array(png), {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur génération' }, { status: 500 })
  }
}
