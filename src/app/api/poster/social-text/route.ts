import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireUser } from '@/lib/server-auth'
import { can } from '@/lib/capabilities'
import { rateLimit } from '@/lib/rateLimit'

export const runtime = 'nodejs'
export const maxDuration = 30

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Borne chaque champ injecté dans le prompt → coût Claude maîtrisé.
const cap = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '')

/**
 * POST — génère un texte de publication réseaux sociaux pour un événement.
 * Body : { event: <contrat app> }  →  { text }
 */
export async function POST(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx
  if (!can(ctx, 'promo_pro')) {
    return NextResponse.json({ error: 'Réservé aux Partenaires Locaux' }, { status: 403 })
  }
  const blocked = await rateLimit(ctx.userId, 'poster_caption', ctx.plan, ctx.isAdmin)
  if (blocked) return blocked

  const { event = {} } = await req.json().catch(() => ({}))
  const facts = [
    event.titre && `Titre : ${cap(event.titre, 200)}`,
    (event.date_debut || event.heure) && `Quand : ${[cap(event.date_debut, 20), cap(event.heure, 10)].filter(Boolean).join(' à ')}`,
    (event.lieu_nom || event.commune) && `Où : ${[cap(event.lieu_nom, 80), cap(event.commune, 80)].filter(Boolean).join(', ')}`,
    event.prix && `Prix : ${cap(event.prix, 40)}`,
    event.categorie_label && `Type : ${cap(event.categorie_label, 40)}`,
    event.organisateurs && `Organisé par : ${cap(event.organisateurs, 100)}`,
    event.etablissement?.nom && `Établissement : ${cap(event.etablissement.nom, 100)}`,
    event.description && `Détails : ${cap(event.description, 600)}`,
  ].filter(Boolean).join('\n')

  try {
    const r = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      temperature: 0.8,
      system: "Tu es community manager pour les commerces et associations d'un village de l'Hérault. " +
        "Rédige une publication courte et chaleureuse pour Facebook/Instagram annonçant un événement local. " +
        "Style : convivial, direct, 2 à 4 phrases, quelques emojis pertinents (sans excès), termine par 1 à 3 hashtags locaux. " +
        "Pas de lien, pas de markdown. Réponds UNIQUEMENT le texte du post, en français.",
      messages: [{ role: 'user', content: `Infos de l'événement :\n${facts || '(peu d\'infos)'}` }],
    })
    const text = r.content[0]?.type === 'text' ? r.content[0].text.trim() : ''
    return NextResponse.json({ text })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur génération texte' }, { status: 500 })
  }
}
