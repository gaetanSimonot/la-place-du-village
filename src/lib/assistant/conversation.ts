import { supabaseAdmin } from '@/lib/supabase-admin'
import type { Quotas } from '@/lib/assistant/config'
import type { Plan } from '@/lib/capabilities'

/**
 * ASSISTANT VILLAGE — conversations et quota. SERVEUR UNIQUEMENT.
 *
 * Une CONVERSATION, pas un message, est l'unité de tout : du quota, des
 * statistiques, de la mémoire. « Que faire ce week-end ? », « plutôt
 * culture », « et dimanche ? » n'en font qu'une seule.
 *
 * Règle qui prime sur le reste : on ne coupe JAMAIS quelqu'un au milieu d'un
 * échange. Le quota se vérifie à l'OUVERTURE d'une conversation, jamais sur
 * un message de suite. La troisième conversation va donc jusqu'à son terme,
 * et c'est la quatrième qui rencontre la proposition Habitant.
 */

export interface Conversation {
  id: string
  nb_messages: number
}

export interface Ouverture {
  conversation: Conversation | null
  /** Conversations encore offertes. -1 = sans compteur (Habitant, Pro, admin). */
  reste: number
  /** Renseigné quand rien n'a été ouvert : la raison, telle qu'on peut la dire. */
  bloque: 'quota_gratuit' | 'quota_jour' | null
}

/** Fenêtre d'historique envoyée au modèle : assez pour suivre, pas plus. */
const TOURS_GARDES = 8

interface Qui {
  userId: string | null
  anonId: string | null
  plan: Plan
  isAdmin: boolean
}

/** La colonne qui identifie cette personne — un compte prime sur un anonyme. */
function cible(qui: Qui): { colonne: 'user_id' | 'anon_id'; valeur: string } | null {
  if (qui.userId) return { colonne: 'user_id', valeur: qui.userId }
  if (qui.anonId) return { colonne: 'anon_id', valeur: qui.anonId }
  return null
}

/**
 * Reprend la conversation en cours, ou en ouvre une neuve si le quota le
 * permet.
 *
 * Une conversation est « en cours » tant qu'elle appartient à la personne,
 * qu'elle n'a pas dépassé le nombre de tours, et que le dernier message n'est
 * pas trop ancien. Passé ce délai on considère que le sujet a changé : c'est
 * la définition de fin la plus simple qui ne se trompe pas souvent.
 */
export async function ouvrirOuReprendre(
  qui: Qui,
  conversationId: string | null,
  quotas: Quotas,
): Promise<Ouverture> {
  const c = cible(qui)
  if (!c) return { conversation: null, reste: 0, bloque: 'quota_gratuit' }

  if (conversationId) {
    const { data } = await supabaseAdmin
      .from('assistant_conversations')
      .select('id, nb_messages, derniere_le, user_id, anon_id')
      .eq('id', conversationId)
      .maybeSingle()

    const aElle = data && (data as Record<string, unknown>)[c.colonne] === c.valeur
    const fraiche = data
      ? Date.now() - new Date(data.derniere_le).getTime() < quotas.minutes_inactivite * 60_000
      : false
    const place = (data?.nb_messages ?? 0) < quotas.max_tours * 2

    if (aElle && fraiche && place) {
      return { conversation: { id: data!.id, nb_messages: data!.nb_messages }, reste: -1, bloque: null }
    }
  }

  // Nouvelle conversation : c'est ici, et seulement ici, que le quota compte.
  const verdict = await verifierQuota(qui, quotas)
  if (verdict.bloque) return { conversation: null, reste: 0, bloque: verdict.bloque }

  const { data, error } = await supabaseAdmin
    .from('assistant_conversations')
    .insert({ user_id: qui.userId, anon_id: qui.userId ? null : qui.anonId })
    .select('id, nb_messages')
    .single()
  if (error) throw new Error(error.message)

  return { conversation: data as Conversation, reste: verdict.reste, bloque: null }
}

/**
 * Combien il en reste, et faut-il s'arrêter ?
 *
 * Un compte simple et un visiteur ont le même nombre de conversations de
 * découverte : le produit doit se comprendre AVANT de demander quoi que ce
 * soit. Habitant et Partenaire ont un plafond quotidien — un fair-use, pas
 * un « illimité » sans filet. L'admin n'est jamais compté, sinon il ne peut
 * pas travailler.
 */
export async function verifierQuota(
  qui: Qui,
  quotas: Quotas,
): Promise<{ reste: number; bloque: 'quota_gratuit' | 'quota_jour' | null }> {
  if (qui.isAdmin) return { reste: -1, bloque: null }
  const c = cible(qui)
  if (!c) return { reste: 0, bloque: 'quota_gratuit' }

  const paye = qui.plan === 'habitants' || qui.plan === 'pro'
  const plafond = paye ? (qui.plan === 'pro' ? quotas.pro_jour : quotas.habitants_jour) : quotas.gratuites

  let q = supabaseAdmin
    .from('assistant_conversations')
    .select('id', { count: 'exact', head: true })
    .eq(c.colonne, c.valeur)

  // Le compteur d'un abonné se remet à zéro chaque jour. Celui de la
  // découverte, non : trois conversations pour comprendre, une fois.
  if (paye) q = q.gte('demarree_le', new Date(Date.now() - 86_400_000).toISOString())

  const { count } = await q
  const utilisees = count ?? 0
  if (utilisees >= plafond) {
    return { reste: 0, bloque: paye ? 'quota_jour' : 'quota_gratuit' }
  }
  return { reste: plafond - utilisees - 1, bloque: null }
}

/** Les derniers échanges, dans l'ordre, pour redonner le fil au modèle. */
export async function historique(conversationId: string): Promise<{ role: 'user' | 'assistant'; contenu: string }[]> {
  const { data } = await supabaseAdmin
    .from('assistant_messages')
    .select('role, contenu, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(TOURS_GARDES * 2)
  return (data ?? []).reverse().map(m => ({ role: m.role as 'user' | 'assistant', contenu: m.contenu }))
}

/**
 * Enregistre le tour complet.
 *
 * On garde le texte des messages — sans lui, impossible de comprendre
 * pourquoi une réponse a déraillé, ni d'améliorer le prompt. On ne garde en
 * revanche AUCUN résultat d'outil : ce serait recopier la base à côté
 * d'elle-même. Les identifiants proposés suffisent à mesurer les clics.
 */
export async function enregistrerTour(params: {
  conversationId: string
  question: string
  reponse: string
  outils: string[]
  refs: { type: string; id: string }[]
  tokensIn: number
  tokensOut: number
  modele: string
  sujet: string | null
}): Promise<void> {
  await supabaseAdmin.from('assistant_messages').insert([
    { conversation_id: params.conversationId, role: 'user', contenu: params.question },
    {
      conversation_id: params.conversationId,
      role: 'assistant',
      contenu: params.reponse,
      outils: params.outils,
      refs: params.refs,
      tokens_in: params.tokensIn,
      tokens_out: params.tokensOut,
    },
  ])

  // Les compteurs vivent sur la conversation : le suivi de consommation se
  // lit alors sans parcourir les messages.
  const { data } = await supabaseAdmin
    .from('assistant_conversations')
    .select('nb_messages, tokens_in, tokens_out, sujet')
    .eq('id', params.conversationId).maybeSingle()

  await supabaseAdmin.from('assistant_conversations').update({
    derniere_le: new Date().toISOString(),
    nb_messages: (data?.nb_messages ?? 0) + 2,
    tokens_in:   (data?.tokens_in ?? 0) + params.tokensIn,
    tokens_out:  (data?.tokens_out ?? 0) + params.tokensOut,
    modele: params.modele,
    // Le sujet est celui du PREMIER tour : c'est lui qui dit ce que la
    // personne cherchait en ouvrant l'assistant.
    sujet: data?.sujet ?? params.sujet,
  }).eq('id', params.conversationId)
}
