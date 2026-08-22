import Anthropic from '@anthropic-ai/sdk'
import { OUTILS, executerOutil, type Carte, type ActionProposee } from '@/lib/assistant/outils'
import { MAX_TOKENS_REPONSE } from '@/lib/assistant/config'
import type { Consommation } from '@/lib/assistant/cout'
import type { EvenementFlux } from '@/lib/assistant/llm'

/**
 * ASSISTANT VILLAGE — dialogue avec un modèle Claude. SERVEUR UNIQUEMENT.
 *
 * Même contrat que le fournisseur OpenAI : une question, un historique, et le
 * même flux d'événements en retour. Tout ce qui compte — outils, cartes,
 * verrous, quota — vit ailleurs et ignore qui répond.
 *
 * Ici le texte est STREAMÉ : la phrase s'écrit pendant que les fiches
 * arrivent, ce qui rend l'attente supportable sur une réponse longue.
 */

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * La recherche web — complément, jamais remplacement.
 *
 * Elle tourne chez Anthropic : on la déclare, le modèle l'appelle, rien ne
 * s'exécute chez nous. Deux raisons de la tenir serrée :
 *
 *   — L'ARGENT. Une seule recherche coûte ~13 000 tokens d'entrée, soit plus
 *     qu'une conversation locale entière. D'où `max_uses: 2`, et la variante
 *     de base plutôt que celle à filtrage dynamique, qui en consomme 50 % de
 *     plus pour un numéro de mairie.
 *   — LE PROJET. Les événements, commerces, annonces et séances du secteur
 *     vivent dans La Place du Village, et nulle part ailleurs. Le cadrage
 *     lui-même est dans le prompt, en base : c'est du jugement, pas de la
 *     mécanique, et il doit pouvoir se corriger sans redéploiement.
 */
const OUTIL_WEB = { type: 'web_search_20250305', name: 'web_search', max_uses: 2 }

interface Params {
  modele: string
  systeme: string
  question: string
  historique: { role: 'user' | 'assistant'; contenu: string }[]
  maxOutils: number
}

export async function* repondreAnthropic(p: Params): AsyncGenerator<EvenementFlux> {
  const messages: Anthropic.MessageParam[] = [
    ...p.historique.map(m => ({ role: m.role, content: m.contenu })),
    { role: 'user' as const, content: p.question },
  ]

  const conso: Consommation = { entree: 0, cacheLu: 0, cacheEcrit: 0, sortie: 0, recherchesWeb: 0 }
  const outilsAppeles: string[] = []
  const cartes: Carte[] = []
  let action: ActionProposee | undefined
  let texte = ''

  for (let tour = 0; tour <= p.maxOutils; tour++) {
    // Dernier tour : plus d'outils, il conclut avec ce qu'il a déjà lu.
    const encoreDesOutils = tour < p.maxOutils

    const flux = anthropic.messages.stream({
      model: p.modele,
      max_tokens: MAX_TOKENS_REPONSE,
      // Le prompt et la liste d'outils ne bougent pas d'un message à l'autre :
      // ils sont mis en cache, et seules les questions successives se paient
      // plein tarif. C'est l'essentiel de l'économie sur une conversation.
      system: [{ type: 'text', text: p.systeme, cache_control: { type: 'ephemeral' } }],
      // Assez de réflexion pour choisir les bons outils sans expédier la
      // question. Réglable ici seul.
      output_config: { effort: 'low' },
      tools: encoreDesOutils
        ? ([...OUTILS, OUTIL_WEB] as unknown as Anthropic.Tool[])
        : undefined,
      messages,
    })

    for await (const ev of flux) {
      if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
        texte += ev.delta.text
        yield { type: 'texte', delta: ev.delta.text }
      }
      // La recherche web s'exécute chez Anthropic : on ne la déclenche pas,
      // on la voit passer. On le dit à l'écran, c'est plus long qu'une
      // requête locale et il faut que ça se comprenne.
      if (ev.type === 'content_block_start' && ev.content_block?.type === 'server_tool_use') {
        conso.recherchesWeb += 1
        yield { type: 'outil', nom: 'web_search', mots: null }
      }
    }

    const message = await flux.finalMessage()
    conso.entree     += message.usage.input_tokens
    conso.cacheLu    += message.usage.cache_read_input_tokens ?? 0
    conso.cacheEcrit += message.usage.cache_creation_input_tokens ?? 0
    conso.sortie     += message.usage.output_tokens

    // Le modèle a lancé une recherche web et attend ses résultats : on lui
    // rend la main sans rien exécuter de notre côté.
    if (message.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: message.content })
      continue
    }
    if (message.stop_reason !== 'tool_use') break

    messages.push({ role: 'assistant', content: message.content })

    // Les appels d'un même tour partent ensemble, et TOUS les résultats
    // reviennent dans un seul message : les séparer apprendrait au modèle à
    // ne plus jamais paralléliser.
    const demandes = message.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    )
    const resultats: Anthropic.ToolResultBlockParam[] = []

    for (const d of demandes) {
      outilsAppeles.push(d.name)
      const cherches = (d.input as { mots?: unknown })?.mots
      yield {
        type: 'outil', nom: d.name,
        mots: Array.isArray(cherches) ? cherches.filter(m => typeof m === 'string').slice(0, 3).join(', ') : null,
      }
      try {
        const r = await executerOutil(d.name, (d.input ?? {}) as Record<string, unknown>)
        if (r.cartes.length) { cartes.push(...r.cartes); yield { type: 'cartes', items: r.cartes } }
        if (r.action) { action = r.action; yield { type: 'action', action: r.action } }
        resultats.push({ type: 'tool_result', tool_use_id: d.id, content: JSON.stringify(r.pourLeModele) })
      } catch (e) {
        // Un outil en échec ne doit pas emporter le tour : on le dit au
        // modèle, qui peut se rabattre sur un autre ou l'annoncer.
        console.error('[assistant:outil]', d.name, (e as Error).message)
        resultats.push({
          type: 'tool_result', tool_use_id: d.id, is_error: true,
          content: 'Recherche indisponible pour le moment.',
        })
      }
    }

    messages.push({ role: 'user', content: resultats })
    texte = texte.trimEnd()
  }

  if (conso.recherchesWeb) outilsAppeles.push('web_search')
  yield { type: 'brut', texte, cartes, action, outils: outilsAppeles, conso }
}
