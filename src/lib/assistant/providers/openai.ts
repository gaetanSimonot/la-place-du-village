import { OUTILS, executerOutil, type Carte, type ActionProposee } from '@/lib/assistant/outils'
import { MAX_TOKENS_REPONSE } from '@/lib/assistant/config'
import type { Consommation } from '@/lib/assistant/cout'
import type { EvenementFlux } from '@/lib/assistant/llm'

/**
 * ASSISTANT VILLAGE — dialogue avec un modèle OpenAI. SERVEUR UNIQUEMENT.
 *
 * Même contrat que le fournisseur Anthropic : on reçoit une question et un
 * historique, on rend le même flux d'événements. Tout ce qui compte — les
 * outils, les cartes, les verrous, le quota — vit ailleurs et ne sait pas qui
 * répond. C'est ce qui permet de changer de modèle en changeant une ligne.
 *
 * On passe par l'API HTTP plutôt que par un SDK : un seul point d'entrée,
 * aucune dépendance de plus dans le projet, et la même mécanique vaudra pour
 * n'importe quel service qui parle le même dialecte — ils sont nombreux.
 *
 * Pas de streaming ici : ces modèles répondent en quelques secondes, et la
 * réponse arrive d'un bloc. L'écran affiche « je cherche » pendant ce temps,
 * ce qui est plus honnête qu'un texte qui s'écrit puis se corrige.
 */

const URL = 'https://api.openai.com/v1/chat/completions'

interface Params {
  modele: string
  systeme: string
  question: string
  historique: { role: 'user' | 'assistant'; contenu: string }[]
  maxOutils: number
}

/** Les mêmes outils, dans le dialecte des fonctions OpenAI. */
const outilsOpenAI = OUTILS.map(o => ({
  type: 'function' as const,
  function: { name: o.name, description: o.description, parameters: o.input_schema },
}))

interface AppelOutil { id: string; function: { name: string; arguments: string } }

export async function* repondreOpenAI(p: Params): AsyncGenerator<EvenementFlux> {
  const cle = process.env.OPENAI_API_KEY
  if (!cle) throw new Error('OPENAI_API_KEY absente')

  const messages: Record<string, unknown>[] = [
    { role: 'system', content: p.systeme },
    ...p.historique.map(m => ({ role: m.role, content: m.contenu })),
    { role: 'user', content: p.question },
  ]

  const conso: Consommation = { entree: 0, cacheLu: 0, cacheEcrit: 0, sortie: 0, recherchesWeb: 0 }
  const outilsAppeles: string[] = []
  const cartes: Carte[] = []
  let action: ActionProposee | undefined
  let texte = ''

  for (let tour = 0; tour <= p.maxOutils; tour++) {
    const rep = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cle}` },
      body: JSON.stringify({
        model: p.modele,
        messages,
        max_completion_tokens: MAX_TOKENS_REPONSE,
        tools: tour < p.maxOutils ? outilsOpenAI : undefined,
      }),
    })
    const j = await rep.json()
    if (!rep.ok) throw new Error(`OpenAI ${rep.status} : ${JSON.stringify(j).slice(0, 200)}`)

    const usage = j.usage ?? {}
    // Le cache est automatique et ne se facture pas à l'écriture : on ne
    // compte donc que ce qui est relu, et le reste en entrée pleine.
    const caches = usage.prompt_tokens_details?.cached_tokens ?? 0
    conso.entree += Math.max(0, (usage.prompt_tokens ?? 0) - caches)
    conso.cacheLu += caches
    conso.sortie += usage.completion_tokens ?? 0

    const msg = j.choices?.[0]?.message
    texte = typeof msg?.content === 'string' ? msg.content : ''
    const appels: AppelOutil[] = msg?.tool_calls ?? []
    if (!appels.length) break

    messages.push(msg)
    for (const a of appels) {
      const nom = a.function?.name
      if (!nom) continue
      outilsAppeles.push(nom)

      let args: Record<string, unknown> = {}
      try { args = JSON.parse(a.function.arguments || '{}') } catch { /* arguments illisibles */ }
      yield {
        type: 'outil', nom,
        mots: Array.isArray(args.mots)
          ? (args.mots as unknown[]).filter(m => typeof m === 'string').slice(0, 3).join(', ')
          : null,
      }

      try {
        const r = await executerOutil(nom, args)
        if (r.cartes.length) { cartes.push(...r.cartes); yield { type: 'cartes', items: r.cartes } }
        if (r.action) { action = r.action; yield { type: 'action', action: r.action } }
        messages.push({ role: 'tool', tool_call_id: a.id, content: JSON.stringify(r.pourLeModele) })
      } catch (e) {
        console.error('[assistant:outil]', nom, (e as Error).message)
        messages.push({ role: 'tool', tool_call_id: a.id, content: 'Recherche indisponible pour le moment.' })
      }
    }
  }

  // Le texte n'a pas été streamé : on le livre d'un bloc avant la fin.
  if (texte) yield { type: 'texte', delta: texte }
  yield { type: 'brut', texte, cartes, action, outils: outilsAppeles, conso }
}
