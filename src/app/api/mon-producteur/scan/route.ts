import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const CATEGORIES = [
  'fruits_legumes', 'viandes', 'fromages_laitages', 'oeufs',
  'pain', 'miel', 'panier', 'plantes', 'huiles', 'boissons', 'artisanat', 'autre',
]

export async function POST(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabaseAdmin
    .from('profiles').select('plan').eq('user_id', user.id).maybeSingle()
  if (profile?.plan !== 'max') return NextResponse.json({ error: 'Plan MAX requis' }, { status: 403 })

  const body = await req.json()
  const { images, mimeTypes, text } = body as {
    images?: string[]
    mimeTypes?: string[]
    text?: string
  }

  const system = `Tu es un assistant pour les producteurs locaux français.
Identifie les produits à vendre à partir de photos ou de texte.
Pour chaque produit trouvé, génère un objet JSON avec ces champs :
- nom (string) : nom du produit
- categorie (string) : EXACTEMENT une valeur parmi : ${CATEGORIES.join(', ')}
- prix_indicatif (string|null) : ex "3€/kg", "10€ la pièce", ou null
- disponible (boolean) : true par défaut
- periode_dispo (string|null) : "semaine", "weekend", ou null

Réponds UNIQUEMENT avec du JSON valide, sans markdown, sans commentaire :
{"products":[...]}`

  let content: Anthropic.MessageParam['content']

  if (images && images.length > 0) {
    const imageBlocks: Anthropic.ImageBlockParam[] = images.map((data, i) => ({
      type: 'image',
      source: {
        type: 'base64',
        media_type: ((mimeTypes?.[i] ?? 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'),
        data,
      },
    }))
    content = [
      { type: 'text', text: text ? `Contexte : ${text}\n\nAnalyse ces images et liste les produits.` : 'Liste tous les produits visibles sur ces images.' },
      ...imageBlocks,
    ]
  } else {
    content = `Identifie les produits dans ce texte et génère les fiches : ${text ?? ''}`
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content }],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : ''
    const match = raw.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(match?.[0] ?? '{}')
    return NextResponse.json({ products: parsed.products ?? [] })
  } catch {
    return NextResponse.json({ products: [] })
  }
}
