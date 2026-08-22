import Anthropic from '@anthropic-ai/sdk'
import { getPrompt } from '@/lib/prompts-ia'
import { OUTILS, executerOutil, type Carte } from '@/lib/assistant/outils'
import { MODELE, MAX_TOKENS_REPONSE } from '@/lib/assistant/config'

/**
 * ASSISTANT VILLAGE — le modèle. SERVEUR UNIQUEMENT.
 *
 * SEUL fichier du projet qui connaît Anthropic pour l'assistant. Tout le
 * reste (outils, quota, route, écran) ignore quel modèle répond : en changer
 * après mesure ne doit toucher qu'une constante dans config.ts.
 *
 * La boucle est classique — le modèle demande des outils, on les exécute, on
 * lui rend les résultats, il rédige — avec deux garde-fous : un nombre maximal
 * de tours d'outils, et des cartes émises AU FIL DE L'EAU vers le client, si
 * bien que les fiches s'affichent pendant que la phrase s'écrit.
 */

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export type EvenementFlux =
  | { type: 'texte';  delta: string }
  | { type: 'outil';  nom: string; mots?: string | null }
  | { type: 'cartes'; items: Carte[] }
  | { type: 'fin';    texte: string; outils: string[]; tokensIn: number; tokensOut: number; sujet: string | null }

/** Ce que chaque outil dit du besoin — sert aux statistiques, sans lire les messages. */
const SUJETS: Record<string, string> = {
  chercher_evenements:    'sortie',
  chercher_etablissements: 'service',
  chercher_seances:       'cinema',
  chercher_promotions:    'bon_plan',
  chercher_annonces:      'annonce',
  aide_lpv:               'aide',
  meteo:                  'sortie',
}

/** Aujourd'hui en toutes lettres — le serveur Vercel est en UTC, jamais à Paris. */
function aujourdhuiFr(): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date())
}

/**
 * Un tour complet de conversation, émis au fur et à mesure.
 *
 * `maxOutils` borne le nombre d'allers-retours d'outils : sans lui, une
 * demande mal comprise peut faire tourner le modèle en rond aux frais du
 * projet. Au-delà, on lui retire les outils et il répond avec ce qu'il a.
 */
export async function* repondre(params: {
  question: string
  historique: { role: 'user' | 'assistant'; contenu: string }[]
  maxOutils: number
}): AsyncGenerator<EvenementFlux> {
  const systeme = await getPrompt('assistant_village', { today: aujourdhuiFr() })

  const messages: Anthropic.MessageParam[] = [
    ...params.historique.map(m => ({ role: m.role, content: m.contenu })),
    { role: 'user' as const, content: params.question },
  ]

  const outilsAppeles: string[] = []
  let texteFinal = ''
  let tokensIn = 0
  let tokensOut = 0

  for (let tour = 0; tour <= params.maxOutils; tour++) {
    // Dernier tour : plus d'outils, il conclut avec ce qu'il a déjà lu.
    const encoreDesOutils = tour < params.maxOutils

    const flux = anthropic.messages.stream({
      model: MODELE,
      max_tokens: MAX_TOKENS_REPONSE,
      // Le prompt et la liste d'outils ne bougent pas d'un message à l'autre :
      // ils sont mis en cache, et seules les questions successives se paient
      // plein tarif. C'est l'essentiel de l'économie sur une conversation.
      system: [{ type: 'text', text: systeme, cache_control: { type: 'ephemeral' } }],
      // Assez de réflexion pour CHOISIR les bons outils et composer une
      // vraie réponse — organiser une journée demande de croiser la météo,
      // une activité et un restaurant. « low » expédiait la question et
      // n'ouvrait qu'un tiroir. Réglable ici seul.
      output_config: { effort: 'medium' },
      tools: encoreDesOutils ? OUTILS : undefined,
      messages,
    })

    for await (const ev of flux) {
      if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
        texteFinal += ev.delta.text
        yield { type: 'texte', delta: ev.delta.text }
      }
    }

    const message = await flux.finalMessage()
    tokensIn  += message.usage.input_tokens + (message.usage.cache_read_input_tokens ?? 0)
    tokensOut += message.usage.output_tokens

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
      // Les mots que le modèle a choisi d'élargir : les montrer pendant la
      // recherche rassure sur ce qu'il est en train de faire, et rend
      // visible le travail qui rattrape « manger italien » → « pizzeria ».
      const cherches = (d.input as { mots?: unknown })?.mots
      yield {
        type: 'outil', nom: d.name,
        mots: Array.isArray(cherches) ? cherches.filter(m => typeof m === 'string').slice(0, 3).join(', ') : null,
      }
      try {
        const r = await executerOutil(d.name, (d.input ?? {}) as Record<string, unknown>)
        if (r.cartes.length) yield { type: 'cartes', items: r.cartes }
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
    texteFinal = texteFinal.trimEnd()
  }

  const sujet = outilsAppeles.length ? SUJETS[outilsAppeles[0]] ?? 'autre' : 'autre'
  yield { type: 'fin', texte: texteFinal, outils: outilsAppeles, tokensIn, tokensOut, sujet }
}
