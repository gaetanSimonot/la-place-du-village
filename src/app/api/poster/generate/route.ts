import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/server-auth'
import { can } from '@/lib/capabilities'
import { generatePoster } from '@/lib/poster/generate.js'
import { BACKGROUNDS, FORMATS } from '@/lib/poster/palettes.js'

// Modules natifs (sharp, resvg) → Node runtime obligatoire.
export const runtime = 'nodejs'
export const maxDuration = 30

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]
const ACCENTS = ['#E74C3C', '#9B59B6', '#27AE60', '#F39C12', '#3498DB', '#E91E63', '#16A085', '#2D5A3D', '#C4622D']

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

  const hasPhoto = !!(o.image || event?.etablissement?.photo_url)

  // "Générer aléatoire" : mélange template (compatible avec les sources dispo)
  // + variation de couleur d'accent (thème).
  if (opts.random) {
    const templates = hasPhoto ? ['bloc', 'grandeDate', 'magazine'] : ['magazine']
    o.template = pick(templates)
    if (Math.random() < 0.6) event.categorie_couleur = pick(ACCENTS)
  }

  // "Utiliser mes fonds d'ambiance" : pioche un fond dans la bibliothèque serveur.
  if (opts.useBackgrounds) {
    o.background = pick(Object.values(BACKGROUNDS as Record<string, string>))
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
