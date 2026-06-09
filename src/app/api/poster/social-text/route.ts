import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireUser } from '@/lib/server-auth'
import { can } from '@/lib/capabilities'

export const runtime = 'nodejs'
export const maxDuration = 30

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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

  const { event = {} } = await req.json().catch(() => ({}))
  const facts = [
    event.titre && `Titre : ${event.titre}`,
    (event.date_debut || event.heure) && `Quand : ${[event.date_debut, event.heure].filter(Boolean).join(' à ')}`,
    (event.lieu_nom || event.commune) && `Où : ${[event.lieu_nom, event.commune].filter(Boolean).join(', ')}`,
    event.prix && `Prix : ${event.prix}`,
    event.categorie_label && `Type : ${event.categorie_label}`,
    event.organisateurs && `Organisé par : ${event.organisateurs}`,
    event.etablissement?.nom && `Établissement : ${event.etablissement.nom}`,
    event.description && `Détails : ${event.description}`,
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
