import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getUserContextFromRequest } from '@/lib/server-auth'
import { rateLimit } from '@/lib/rateLimit'
import { reglages, ouvertA, MODELE } from '@/lib/assistant/config'
import { ouvrirOuReprendre, historique, enregistrerTour } from '@/lib/assistant/conversation'
import { repondre } from '@/lib/assistant/llm'
import type { Carte } from '@/lib/assistant/outils'
import { coutEnEuros } from '@/lib/assistant/cout'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

// Une réponse avec deux tours d'outils prend une dizaine de secondes. On
// laisse de la marge sans jamais laisser tourner indéfiniment.
export const maxDuration = 60

/**
 * ASSISTANT VILLAGE — la conversation.
 *
 * POST { message, conversationId?, anonId } → flux SSE :
 *   texte  : un morceau de phrase, à afficher au fil de l'eau
 *   outil  : le nom d'une recherche lancée (« je cherche… »)
 *   cartes : des fiches RÉELLES, à afficher telles quelles
 *   fin    : identifiant de conversation et solde restant
 *
 * Trois gardes AVANT le moindre appel au modèle : l'assistant est-il ouvert
 * à cette personne, son message est-il de taille raisonnable, et lui
 * reste-t-il une conversation. Masquer l'entrée dans l'écran ne protège rien.
 */

/**
 * L'entrée de l'assistant doit-elle apparaître pour cette personne ?
 *
 * La barre de recherche le demande avant de proposer quoi que ce soit. Ce
 * n'est PAS une garde — le POST refait le calcul — mais c'est ce qui évite
 * de montrer une porte fermée pendant le rodage.
 */
export async function GET(req: NextRequest) {
  const { visibilite } = await reglages()
  const ctx = await getUserContextFromRequest(req)
  return NextResponse.json(
    { ouvert: ouvertA(visibilite, !!ctx?.isAdmin), admin: !!ctx?.isAdmin },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

/** Réponse d'erreur avant l'ouverture du flux — le client sait les lire. */
function refus(code: number, corps: Record<string, unknown>) {
  return NextResponse.json(corps, { status: code, headers: { 'Cache-Control': 'no-store' } })
}

/**
 * Empreinte de l'IP, salée et tronquée. On ne stocke jamais l'adresse : elle
 * ne sert qu'à empêcher qu'un script tire un identifiant anonyme neuf à
 * chaque conversation. Sans sel, l'espace des adresses est assez petit pour
 * qu'un hash se retrouve par force brute.
 */
function empreinteIp(req: NextRequest): string | null {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip')
  if (!ip) return null
  const sel = process.env.SUPABASE_SERVICE_KEY ?? 'sel-par-defaut'
  return createHash('sha256').update(`${sel}:${ip}`).digest('hex').slice(0, 32)
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  const conversationId = typeof body?.conversationId === 'string' ? body.conversationId : null
  const anonId = typeof body?.anonId === 'string' ? body.anonId.slice(0, 64) : null

  const { quotas, visibilite } = await reglages()

  // Sans compte, `getUserContextFromRequest` renvoie null : l'assistant
  // s'essaie sans s'inscrire, c'est voulu.
  const ctx = await getUserContextFromRequest(req)
  if (ctx?.banned) return refus(403, { error: 'Compte suspendu' })

  if (!ouvertA(visibilite, !!ctx?.isAdmin)) {
    return refus(403, { error: 'Assistant Village indisponible.', ferme: true })
  }
  if (!message) return refus(400, { error: 'Message vide' })
  if (message.length > quotas.max_caracteres) {
    return refus(400, { error: `Message trop long (${quotas.max_caracteres} caractères maximum).` })
  }
  if (!ctx && !anonId) return refus(400, { error: 'Identifiant manquant' })

  // Anti-script pour les comptes. Les visiteurs sont bornés autrement : par
  // le nombre de conversations offertes et par l'empreinte d'IP ci-dessous.
  if (ctx) {
    const bloque = await rateLimit(ctx.userId, 'assistant', ctx.plan, ctx.isAdmin)
    if (bloque) return bloque
  }

  const ip = empreinteIp(req)
  if (!ctx && ip) {
    const { count } = await supabaseAdmin
      .from('assistant_conversations')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', ip)
      .gte('demarree_le', new Date(Date.now() - 3_600_000).toISOString())
    if ((count ?? 0) >= quotas.ip_heure) {
      return refus(429, { error: 'Trop de conversations ouvertes depuis cet appareil. Réessayez plus tard.' })
    }
  }

  let ouverture
  try {
    ouverture = await ouvrirOuReprendre(
      { userId: ctx?.userId ?? null, anonId, plan: ctx?.plan ?? 'basic', isAdmin: !!ctx?.isAdmin },
      conversationId,
      quotas,
    )
  } catch (e) {
    console.error('[assistant:ouverture]', (e as Error).message)
    return refus(500, { error: 'Assistant indisponible pour le moment.' })
  }

  if (!ouverture.conversation) {
    // Le quota est atteint. On ne coupe personne en route — cette réponse ne
    // peut arriver que sur une NOUVELLE conversation.
    return refus(429, {
      error: ouverture.bloque === 'quota_jour'
        ? 'Vous avez beaucoup échangé aujourd’hui. L’assistant revient demain.'
        : 'Vous avez utilisé vos conversations de découverte.',
      quotaEpuise: true,
      raison: ouverture.bloque,
    })
  }

  const conv = ouverture.conversation
  if (ip) {
    // Posée à la création seulement ; une reprise n'a rien à réécrire.
    await supabaseAdmin.from('assistant_conversations')
      .update({ ip_hash: ip }).eq('id', conv.id).is('ip_hash', null)
  }

  const passe = await historique(conv.id)

  const encodeur = new TextEncoder()
  const flux = new ReadableStream({
    async start(controle) {
      const envoyer = (o: unknown) => controle.enqueue(encodeur.encode(`data: ${JSON.stringify(o)}\n\n`))
      const cartesVues: Carte[] = []

      try {
        envoyer({ type: 'debut', conversationId: conv.id, reste: ouverture.reste })

        for await (const ev of repondre({ question: message, historique: passe, maxOutils: quotas.max_outils_tour })) {
          if (ev.type === 'cartes') cartesVues.push(...ev.items)
          if (ev.type === 'fin') {
            // On enregistre AVANT de fermer : si le client raccroche, le tour
            // est quand même compté et la conversation reste cohérente.
            await enregistrerTour({
              conversationId: conv.id,
              question: message,
              reponse: ev.texte,
              outils: ev.outils,
              refs: cartesVues.map(c => ({ type: c.type, id: c.id })),
              tokensIn: ev.tokensIn,
              tokensOut: ev.tokensOut,
              modele: MODELE,
              sujet: ev.sujet,
            }).catch(e => console.error('[assistant:enregistrement]', (e as Error).message))
            envoyer({
              type: 'fin', conversationId: conv.id, reste: ouverture.reste,
              // Le coût n'est calculé et transmis QU'AUX ADMINS : c'est un
              // instrument de réglage, pas une information pour les habitants.
              cout: ctx?.isAdmin ? coutEnEuros(ev.conso) : undefined,
            })
          } else {
            envoyer(ev)
          }
        }
      } catch (e) {
        console.error('[assistant]', (e as Error).message)
        envoyer({ type: 'erreur', message: 'L’assistant n’a pas pu répondre. Réessayez dans un instant.' })
      } finally {
        controle.close()
      }
    },
  })

  return new Response(flux, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      // Vercel et certains proxys tamponnent sinon, et le flux arrive d'un
      // bloc à la fin — ce qui annule tout l'intérêt du streaming.
      'X-Accel-Buffering': 'no',
    },
  })
}
