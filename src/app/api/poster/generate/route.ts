import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { requireUser } from '@/lib/server-auth'
import { can } from '@/lib/capabilities'
import { rateLimit } from '@/lib/rateLimit'
import { generatePoster } from '@/lib/poster/generate.js'
import { BACKGROUNDS, FORMATS } from '@/lib/poster/palettes.js'

// Modules natifs (sharp, resvg) → Node runtime obligatoire.
export const runtime = 'nodejs'
export const maxDuration = 30

// Couleur pleine par défaut si le client n'en fournit pas (option "Fond uni").
const DEFAULT_SOLID = '#1B1C2B'
const MAX_IMG_BYTES = 6 * 1024 * 1024   // cap anti image-bomb / payload
const isHex = (s: unknown): s is string => typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s)

const solidBg = (hex: string) =>
  sharp({ create: { width: 32, height: 32, channels: 3, background: hex } }).png().toBuffer()

/**
 * data:…base64 → Buffer. On REFUSE toute autre chaîne (URL http) : sinon le
 * moteur ferait un fetch côté serveur → SSRF. Cap de taille en prime.
 */
function toSource(s?: string | null): Buffer | null {
  if (!s || typeof s !== 'string' || !s.startsWith('data:')) return null
  const buf = Buffer.from(s.split(',')[1] ?? '', 'base64')
  return buf.length > 0 && buf.length <= MAX_IMG_BYTES ? buf : null
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
  const blocked = await rateLimit(ctx.userId, 'poster_generate', ctx.plan, ctx.isAdmin)
  if (blocked) return blocked

  const body = await req.json().catch(() => ({}))
  const event = body.event ?? {}
  const opts = body.opts ?? {}

  // Anti-SSRF : on ne laisse passer comme photo de fond QUE notre storage
  // Supabase (le client n'envoie de toute façon pas ce champ).
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const pu = event?.etablissement?.photo_url
  if (pu && !(typeof pu === 'string' && pu.startsWith(supaUrl + '/storage/v1/object/public/'))) {
    event.etablissement.photo_url = null
  }

  const o: Record<string, unknown> = { output: 'png' }
  o.image = toSource(opts.image)
  o.logo = toSource(opts.logo)
  o.format = (opts.format && (FORMATS as Record<string, unknown>)[opts.format]) ? opts.format : 'social-portrait'
  if (typeof opts.template === 'string') o.template = opts.template

  // Déterministe : tout le hasard est piloté par le CLIENT (template, bgIndex,
  // accent, solidColor). Un même jeu d'opts → même affiche. Changer un seul
  // paramètre n'altère donc pas les autres.
  if (isHex(opts.accent)) event.categorie_couleur = opts.accent

  if (opts.solidBg) {
    o.background = await solidBg(isHex(opts.solidColor) ? opts.solidColor : DEFAULT_SOLID)
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
