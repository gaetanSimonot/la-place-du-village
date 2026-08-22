'use client'

/**
 * ASSISTANT VILLAGE — les conversations gardées sur l'appareil.
 *
 * Pourquoi ici et pas en base : cliquer sur une fiche proposée FAIT QUITTER
 * la conversation — c'est une vraie navigation vers /evenement/… — et au
 * retour tout avait disparu. Or ce qu'on veut relire au retour, ce sont les
 * cartes elles-mêmes, que la base ne stocke pas (elle ne garde que le texte
 * et les identifiants cités). Le navigateur, lui, les a déjà sous la main.
 *
 * Trois conversations au maximum, la plus ancienne part quand une quatrième
 * s'ouvre : un assistant local n'a pas besoin d'archives, et localStorage
 * n'est pas un entrepôt.
 *
 * Rien de tout cela ne sort de l'appareil, et rien n'est nécessaire au
 * fonctionnement : si la lecture échoue (navigation privée, stockage plein),
 * on repart d'une conversation neuve sans le dire.
 */

export interface MessageLocal {
  role: 'user' | 'assistant'
  texte: string
  cartes: { type: string; id: string; data: Record<string, unknown> }[]
}

export interface ConversationLocale {
  /** L'identifiant SERVEUR : c'est lui qui permet de reprendre le fil. */
  id: string | null
  /** Sa première question, pour la retrouver dans la liste. */
  titre: string
  /** Dernière activité, en millisecondes. */
  at: number
  messages: MessageLocal[]
}

const CLE = 'lpv_assistant_convs'
const MAX_CONV = 3
/** Au-delà, on coupe le début : personne ne relit trente échanges. */
const MAX_MESSAGES = 24

export function lireConversations(): ConversationLocale[] {
  try {
    const brut = localStorage.getItem(CLE)
    if (!brut) return []
    const liste = JSON.parse(brut)
    if (!Array.isArray(liste)) return []
    return liste
      .filter(c => c && Array.isArray(c.messages))
      .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
      .slice(0, MAX_CONV)
  } catch { return [] }
}

/** La conversation en cours, celle qu'on rouvre en revenant. */
export function derniereConversation(): ConversationLocale | null {
  return lireConversations()[0] ?? null
}

/**
 * Enregistre une conversation et fait la place.
 *
 * La reconnaissance se fait sur l'identifiant serveur quand il existe ; tant
 * qu'il n'est pas connu (première réponse pas encore arrivée), on remplace
 * l'entrée sans identifiant, sinon un doublon apparaîtrait à chaque message.
 */
export function enregistrerConversation(conv: ConversationLocale): void {
  try {
    const messages = conv.messages.slice(-MAX_MESSAGES)
    const titre = conv.titre || messages.find(m => m.role === 'user')?.texte?.slice(0, 60) || 'Conversation'
    const maj: ConversationLocale = { ...conv, titre, messages, at: Date.now() }

    const autres = lireConversations().filter(c =>
      maj.id ? c.id !== maj.id : c.id !== null)
    const liste = [maj, ...autres].slice(0, MAX_CONV)
    localStorage.setItem(CLE, JSON.stringify(liste))
  } catch { /* stockage indisponible : la conversation vit le temps de l'écran */ }
}

export function oublierConversation(id: string | null): void {
  try {
    const liste = lireConversations().filter(c => c.id !== id)
    localStorage.setItem(CLE, JSON.stringify(liste))
  } catch { /* noop */ }
}

/** Y a-t-il quelque chose à reprendre, et depuis quand ? */
export function resumeReprise(): { titre: string; minutes: number } | null {
  const c = derniereConversation()
  if (!c || !c.messages.length) return null
  return { titre: c.titre, minutes: Math.round((Date.now() - (c.at ?? 0)) / 60_000) }
}
