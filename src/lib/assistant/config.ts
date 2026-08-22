import { supabaseAdmin } from '@/lib/supabase-admin'
import { GANGES } from '@/lib/distance'

/**
 * ASSISTANT VILLAGE — réglages. SERVEUR UNIQUEMENT.
 *
 * Rien de ce qui suit n'est en dur dans le code : combien de conversations
 * sont offertes, ce qui se passe ensuite, qui voit l'entrée — tout se change
 * depuis l'admin, sans redéploiement. C'est explicitement demandé : le
 * lancement sert à MESURER, les valeurs bougeront.
 */

/** Le centre du secteur — la météo se demande pour le bourg, pas pour la rue. */
export const GANGES_LAT = GANGES.lat
export const GANGES_LNG = GANGES.lng

/**
 * Le modèle. Un seul endroit dans tout le projet le nomme.
 *
 * Changer cette ligne suffit : le fournisseur, le prompt et la façon de
 * dialoguer en découlent. L'assistant ne dépend structurellement d'aucun
 * modèle — ni de celui d'aujourd'hui, ni de celui qui sera meilleur marché
 * dans six mois.
 */
export const MODELE = 'claude-sonnet-5'

/**
 * Les modèles qu'un admin peut essayer depuis l'en-tête de la conversation.
 *
 * Liste blanche, et c'est le point : le modèle voyage dans la requête pour
 * qu'un essai soit immédiat, donc il ne doit jamais être un nom libre venu du
 * navigateur. Les libellés sont ceux qu'on lit en haut de l'écran.
 */
export const MODELES_ESSAI = [
  { id: 'claude-sonnet-5', label: 'sonnet-5',     note: 'le plus fin' },
  { id: 'gpt-4.1-mini',    label: 'gpt-4.1-mini', note: '13× moins cher' },
  { id: 'gpt-5-mini',      label: 'gpt-5-mini',   note: 'lent' },
  { id: 'claude-haiku-4-5', label: 'haiku-4.5',   note: 'compact' },
] as const

/** Le nom proposé est-il de ceux qu'on accepte ? */
export function modeleAutorise(v: unknown): string | null {
  return typeof v === 'string' && MODELES_ESSAI.some(m => m.id === v) ? v : null
}

export type Fournisseur = 'anthropic' | 'openai'

/** Qui répond, déduit du nom du modèle. */
export function fournisseur(modele: string = MODELE): Fournisseur {
  return modele.startsWith('claude') ? 'anthropic' : 'openai'
}

/**
 * Quel prompt lui donner.
 *
 * Deux voix pour un seul assistant : `assistant_village` est écrit en prose
 * pour un grand modèle, `assistant_village_gpt` en règles courtes et en
 * exemples pour un modèle compact, qui suit mal deux mille mots de prose.
 * Même fond, même personnalité, même interdits — deux façons de les dire.
 *
 * Le partage ne se fait donc PAS par fournisseur mais par taille : un Haiku
 * est un modèle compact, même s'il vient de chez Anthropic.
 */
export function promptDuModele(modele: string = MODELE): string {
  const grand = /^claude-(sonnet|opus|fable)/.test(modele)
  return grand ? 'assistant_village' : 'assistant_village_gpt'
}

/**
 * Plafond de sortie par tour.
 *
 * Court reste la règle pour une demande simple, mais « organise-moi une
 * journée avec deux amis » demande de la place : météo, une balade, un
 * restaurant, une séance. 900 tokens coupaient la réponse en plein milieu.
 */
export const MAX_TOKENS_REPONSE = 1800

export interface Quotas {
  gratuites: number
  habitants_jour: number
  pro_jour: number
  minutes_inactivite: number
  max_tours: number
  max_outils_tour: number
  max_caracteres: number
  ip_heure: number
}

const DEFAUTS: Quotas = {
  gratuites: 3,
  habitants_jour: 40,
  pro_jour: 40,
  minutes_inactivite: 30,
  max_tours: 12,
  max_outils_tour: 4,
  max_caracteres: 500,
  ip_heure: 10,
}

export type Visibilite = 'masque' | 'admin' | 'tous'

let cache: { at: number; quotas: Quotas; visibilite: Visibilite } | null = null
const TTL = 60_000

/**
 * Lit les deux clés en une fois, cache 60 s — même durée que les prompts.
 * Une valeur absente ou aberrante retombe sur le défaut : un JSON mal saisi
 * dans l'admin ne doit pas fermer l'assistant.
 */
export async function reglages(): Promise<{ quotas: Quotas; visibilite: Visibilite }> {
  const now = Date.now()
  if (cache && now - cache.at < TTL) return { quotas: cache.quotas, visibilite: cache.visibilite }

  const { data } = await supabaseAdmin
    .from('config').select('key, value')
    .in('key', ['assistant_quotas', 'assistant_visibilite'])

  const brut = new Map((data ?? []).map(r => [r.key, r.value]))

  let quotas = DEFAUTS
  try {
    const j = JSON.parse(brut.get('assistant_quotas') ?? '{}') as Partial<Quotas>
    quotas = { ...DEFAUTS }
    for (const cle of Object.keys(DEFAUTS) as (keyof Quotas)[]) {
      const v = Number(j[cle])
      if (Number.isFinite(v) && v > 0) quotas[cle] = Math.floor(v)
    }
  } catch { /* défauts */ }

  const v = brut.get('assistant_visibilite')
  const visibilite: Visibilite = v === 'tous' ? 'tous' : v === 'masque' ? 'masque' : 'admin'

  cache = { at: now, quotas, visibilite }
  return { quotas, visibilite }
}

/** Après une écriture admin, la valeur doit être vue tout de suite. */
export function viderCacheReglages() {
  cache = null
}

/**
 * L'assistant est-il ouvert à cette personne ?
 *
 * `admin` est l'état de rodage : l'entrée n'apparaît que pour les comptes
 * admin, et la route refuse tout le monde d'autre. Masquer un bouton ne
 * protège rien — c'est le serveur qui tranche.
 */
export function ouvertA(visibilite: Visibilite, isAdmin: boolean): boolean {
  if (visibilite === 'tous') return true
  if (visibilite === 'admin') return isAdmin
  return false
}
