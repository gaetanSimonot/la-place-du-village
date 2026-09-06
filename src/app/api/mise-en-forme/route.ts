import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireUser } from '@/lib/server-auth'
import { rateLimit } from '@/lib/rateLimit'

/**
 * METTRE EN FORME UN TEXTE — sans en changer un mot.
 *
 * Le modèle n'a le droit que d'AJOUTER des marques : **gras**, *italique*,
 * ## titres, listes à tirets, et des sauts de ligne. Il ne réécrit pas, ne
 * corrige pas, ne raccourcit pas. C'est ce qui rend le bouton utilisable sans
 * relire : on publie ses propres phrases, mieux présentées.
 *
 * Et cette promesse est VÉRIFIÉE, pas seulement demandée. On compare les
 * lettres et les chiffres du texte rendu à ceux du texte reçu ; au moindre
 * écart on renvoie l'original. Un modèle qui déborde ne peut donc pas publier
 * à la place de l'habitant — au pire il n'a servi à rien.
 *
 * Le format produit est celui que `TexteRiche` sait déjà rendre et que
 * `texteBrut()` sait aplatir : on n'introduit aucune syntaxe nouvelle.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MODELE = 'claude-haiku-4-5-20251001'
const MAX = 5000

const CONSIGNE = `Tu mets en forme un texte écrit par un habitant pour le site de son village.

RÈGLE ABSOLUE : tu ne changes AUCUN mot. Pas de correction, pas de reformulation,
pas d'ajout, pas de suppression. Les mots rendus sont exactement les mots reçus,
dans le même ordre.

Tu peux SEULEMENT ajouter :
- **gras** autour de ce qui est important (un nom, une date, un lieu, un prix)
- *italique* pour une nuance
- ## Titre en début de section quand le texte en comporte plusieurs
- des listes à tirets quand le texte énumère
- des sauts de ligne pour aérer les paragraphes

Reste sobre : quelques gras bien placés valent mieux qu'un texte entièrement
balisé. Si le texte est court ou déjà clair, tu peux ne presque rien ajouter.

Réponds UNIQUEMENT avec le texte mis en forme, sans commentaire ni préambule.`

/**
 * La signature d'un texte : ses lettres et ses chiffres, rien d'autre.
 *
 * Tout le reste — marques, espaces, sauts de ligne, ponctuation — est
 * précisément ce que le modèle a le droit de toucher.
 */
function signature(t: string): string {
  return t.toLowerCase().replace(/[^0-9a-zà-öø-ÿ]/g, '')
}

export async function POST(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  // Compteur DÉDIÉ, pas celui de l'extraction : les deux n'ont ni le même coût
  // ni le même usage, et partager un budget rend chacun illisible.
  const bloque = await rateLimit(ctx.userId, 'mise_en_forme', ctx.plan, ctx.isAdmin)
  if (bloque) return bloque

  const { texte } = await req.json().catch(() => ({ texte: null }))
  if (typeof texte !== 'string' || !texte.trim()) {
    return NextResponse.json({ error: 'Texte manquant' }, { status: 400 })
  }
  if (texte.length > MAX) {
    return NextResponse.json({ error: 'Texte trop long' }, { status: 400 })
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const r = await anthropic.messages.create({
      model: MODELE,
      max_tokens: 2000,
      system: CONSIGNE,
      messages: [{ role: 'user', content: texte }],
    })
    const sortie = r.content
      .filter((c): c is Anthropic.TextBlock => c.type === 'text')
      .map(c => c.text).join('').trim()

    if (!sortie) return NextResponse.json({ texte, inchange: true })

    // La vérification qui tient la promesse. Un écart de lettres, et on rend
    // le texte d'origine : mieux vaut un bouton qui n'a rien fait qu'un texte
    // que son auteur ne reconnaît pas.
    if (signature(sortie) !== signature(texte)) {
      return NextResponse.json({ texte, inchange: true, motif: 'mots modifiés' })
    }

    return NextResponse.json({ texte: sortie, inchange: false })
  } catch {
    return NextResponse.json({ texte, inchange: true, motif: 'service indisponible' })
  }
}
