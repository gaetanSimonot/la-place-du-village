import { getPrompt } from '@/lib/prompts-ia'
import type { Carte, ActionProposee } from '@/lib/assistant/outils'
import { MODELE, fournisseur, promptDuModele } from '@/lib/assistant/config'
import { verrouillerReponse } from '@/lib/assistant/reponse'
import type { Consommation } from '@/lib/assistant/cout'
import { repondreAnthropic } from '@/lib/assistant/providers/anthropic'
import { repondreOpenAI } from '@/lib/assistant/providers/openai'

/**
 * ASSISTANT VILLAGE — le chef d'orchestre. SERVEUR UNIQUEMENT.
 *
 * Ce fichier ne parle à aucun modèle. Il choisit le fournisseur, lui donne le
 * prompt qui lui convient, et VERROUILLE ce qui revient. Les modèles vivent
 * dans providers/ ; en ajouter un ne touche rien d'autre.
 *
 * Le verrou est la raison d'être de cette couche. Un prompt demande, il
 * n'impose pas : le banc d'essai a montré des identifiants inventés et des
 * fiches empilées en fin de réponse, deux défauts qu'aucune consigne ne
 * supprime tout à fait. On ne fait donc pas confiance au modèle sur ce qui
 * s'affiche — on le contrôle après coup, et de la même façon pour tous.
 */

/** `brut` est interne : il ne sort jamais d'ici, `fin` le remplace. */
export type EvenementFlux =
  | { type: 'texte';  delta: string }
  | { type: 'outil';  nom: string; mots?: string | null }
  | { type: 'cartes'; items: Carte[] }
  | { type: 'action'; action: ActionProposee }
  | { type: 'brut'; texte: string; cartes: Carte[]; action?: ActionProposee; outils: string[]; conso: Consommation }
  | { type: 'fin'; texte: string; outils: string[]; tokensIn: number; tokensOut: number
      sujet: string | null; conso: Consommation }

/** Ce que chaque outil dit du besoin — sert aux statistiques, sans lire les messages. */
const SUJETS: Record<string, string> = {
  chercher_evenements:     'sortie',
  chercher_etablissements: 'service',
  chercher_seances:        'cinema',
  chercher_promotions:     'bon_plan',
  chercher_annonces:       'annonce',
  proposer_action:         'action',
  aide_lpv:                'aide',
  meteo:                   'sortie',
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
 * `maxOutils` borne le nombre d'allers-retours : sans lui, une demande mal
 * comprise peut faire tourner le modèle en rond aux frais du projet.
 */
export async function* repondre(params: {
  question: string
  historique: { role: 'user' | 'assistant'; contenu: string }[]
  maxOutils: number
}): AsyncGenerator<EvenementFlux> {
  const systeme = await getPrompt(promptDuModele(), { today: aujourdhuiFr() })
  const p = { modele: MODELE, systeme, ...params }

  const flux = fournisseur() === 'anthropic' ? repondreAnthropic(p) : repondreOpenAI(p)

  for await (const ev of flux) {
    if (ev.type !== 'brut') { yield ev; continue }

    // Le seul endroit où l'on décide de ce qui s'affiche vraiment : on retire
    // les fiches que les outils n'ont pas rendues, et on remet chacune
    // derrière la phrase qui en parle.
    const texte = verrouillerReponse(ev.texte, ev.cartes)
    const sujet = ev.outils.length ? SUJETS[ev.outils[0]] ?? 'autre' : 'autre'

    yield {
      type: 'fin', texte, outils: ev.outils, sujet, conso: ev.conso,
      // Ce qu'on enregistre en base reste un total simple : le détail sert au
      // coût affiché, pas au suivi de volume.
      tokensIn: ev.conso.entree + ev.conso.cacheLu + ev.conso.cacheEcrit,
      tokensOut: ev.conso.sortie,
    }
  }
}
