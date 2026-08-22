import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { generatePoster, availableTemplates } from '@/lib/poster/generate.js'
import { BACKGROUNDS, FORMATS, CATEGORIES } from '@/lib/poster/palettes.js'

// Outil de prototypage LOCAL uniquement (pas d'auth). Inerte en production.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const devBlocked = () => process.env.NODE_ENV === 'production'
const BG_DIR = path.join(process.cwd(), 'src', 'lib', 'poster', 'backgrounds')
const isHex = (s: unknown): s is string => typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s)
const dataUrlToBuf = (s?: string | null): Buffer | null => {
  if (!s || typeof s !== 'string' || !s.startsWith('data:')) return null
  const b = Buffer.from(s.split(',')[1] ?? '', 'base64')
  return b.length ? b : null
}

/** GET : config (templates/formats/fonds/catégories) OU prefill d'un event (?eventId=). */
export async function GET(req: NextRequest) {
  if (devBlocked()) return new NextResponse('not found', { status: 404 })
  const sp = new URL(req.url).searchParams
  const id = sp.get('eventId')

  // Liste d'événements pour le sélecteur (récents d'abord).
  if (sp.get('list')) {
    const { data } = await supabaseAdmin
      .from('evenements')
      .select('id, titre, date_debut, statut')
      .order('created_at', { ascending: false })
      .limit(120)
    return NextResponse.json({ events: data ?? [] })
  }

  if (id) {
    const { data: ev } = await supabaseAdmin.from('evenements').select('*, lieux(*)').eq('id', id).maybeSingle()
    if (!ev) return NextResponse.json({ error: 'Événement introuvable' }, { status: 404 })
    const cat = (CATEGORIES as Record<string, { label: string; emoji: string; color: string }>)[ev.categorie] || CATEGORIES.autre
    const lieux = ev.lieux as { nom?: string; commune?: string; adresse?: string } | null
    return NextResponse.json({
      event: {
        titre: ev.titre ?? '', description: ev.description ?? '',
        date_debut: ev.date_debut ?? '', date_fin: ev.date_fin ?? '', heure: ev.heure ?? '',
        lieu_nom: lieux?.nom ?? '', commune: lieux?.commune ?? '', adresse: lieux?.adresse ?? '',
        prix: ev.prix ?? '', categorie: ev.categorie ?? 'autre',
        categorie_label: cat.label, categorie_emoji: cat.emoji, categorie_couleur: cat.color,
      },
    })
  }

  const backgrounds = fs.existsSync(BG_DIR)
    ? fs.readdirSync(BG_DIR).filter(f => /\.(jpe?g|png|webp|avif|jfif)$/i.test(f))
    : []
  return NextResponse.json({
    templates: availableTemplates,
    formats: Object.keys(FORMATS),
    backgrounds,
    defaultBackgrounds: BACKGROUNDS,
    categories: Object.entries(CATEGORIES).map(([key, v]) => ({ key, ...(v as object) })),
  })
}

/** POST : rend l'affiche via le moteur Satori et renvoie le PNG. */
export async function POST(req: NextRequest) {
  if (devBlocked()) return new NextResponse('not found', { status: 404 })
  const body = await req.json().catch(() => ({}))
  const event = body.event ?? {}
  const { template, format, accent, bgMode, solidColor, bgName, image, logo } = body

  if (isHex(accent)) event.categorie_couleur = accent

  const o: Record<string, unknown> = {
    output: 'png',
    template: typeof template === 'string' ? template : 'magazine',
    format: (format && (FORMATS as Record<string, unknown>)[format]) ? format : 'social-portrait',
    logo: dataUrlToBuf(logo),
  }

  if (bgMode === 'image') {
    o.image = dataUrlToBuf(image)                    // ta propre photo → prime dans le template
  } else if (bgMode === 'ambiance' && bgName) {
    const p = path.join(BG_DIR, path.basename(String(bgName)))
    o.background = fs.existsSync(p) ? p : null
  } else {
    o.background = await sharp({ create: { width: 32, height: 32, channels: 3, background: isHex(solidColor) ? solidColor : '#1B1C2B' } }).png().toBuffer()
  }

  try {
    const { png } = await generatePoster(event, o)
    if (!png) throw new Error('Rendu vide')
    return new NextResponse(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur génération' }, { status: 500 })
  }
}
