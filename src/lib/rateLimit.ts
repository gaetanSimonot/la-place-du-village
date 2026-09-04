/**
 * RATE LIMIT — La Place du Village
 *
 * Anti-spam pour les routes API coûteuses ou abusables.
 *
 * Stratégie : on log chaque appel dans `api_rate_limits` (audit) et avant
 * chaque appel on compte les appels récents du même user/action dans la
 * fenêtre donnée. Si dépassé → 429.
 *
 * Usage type :
 *   const ctx = await requireUser(req)
 *   if (ctx instanceof Response) return ctx
 *
 *   const rl = await checkRateLimit(ctx.userId, 'ai_extract', RATE_LIMITS.ai_extract)
 *   if (!rl.ok) return rateLimitResponse(rl)
 *
 *   // ... appel coûteux ici ...
 *
 *   await logApiCall(ctx.userId, 'ai_extract')
 *
 * Pour les actions liées à une table existante (annonces, evenements), on
 * peut aussi compter directement dans cette table — voir countRecentInTable.
 * On préfère api_rate_limits pour les appels qui ne créent pas toujours
 * une ligne (ex: extract qui peut échouer ou être un doublon).
 */

import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import type { Plan } from '@/lib/capabilities'

export type RateLimitAction =
  | 'ai_extract'      // Whisper + Claude extract combinés
  | 'create_event'
  | 'article_like'    // toggle like sur article (anti-spam clic)
  | 'article_comment' // ajout commentaire article
  | 'create_article'  // soumission article journal
  | 'create_comment'  // commentaire générique
  | 'places_autocomplete' // Google Places autocomplete (facturé par requête)
  | 'geocode'         // Google Geocoding (facturé par requête)
  | 'voice_edit'      // Édition vocale via Claude (tokens IA)
  | 'link_preview'    // Fetch OG d'un lien externe (anti-abus)
  | 'poster_generate' // Rendu d'affiche serveur (CPU sharp/resvg)
  | 'poster_caption'  // Texte réseaux via Claude (tokens IA)
  | 'assistant'       // Un message envoyé à l'Assistant Village (tokens IA)
  | 'transport_dictee' // Dicter un trajet en car (Whisper + Claude)

export interface RateLimitRule {
  limit: number
  windowMs: number
  /** Texte affiché à l'utilisateur quand dépassé */
  message: string
}

/**
 * Règles graduées par plan.
 *
 * `ai_extract` est accessible à tous (édition vocale = capability générale)
 * mais le plafond gratuit est volontairement bas pour pousser les gros
 * utilisateurs vers Habitants/Partenaire.
 *
 * `create_event` reste un anti-spam global, pas un quota plan.
 */
const HOUR = 60 * 60 * 1000
const DAY  = 24 * HOUR

const RATE_LIMITS_BY_PLAN: Record<RateLimitAction, Record<Plan, RateLimitRule>> = {
  /**
   * Dicter son trajet en car. Coût mesuré : ~0,13 centime la recherche
   * (Whisper + une extraction Haiku de 467 jetons).
   *
   * Compté À LA JOURNÉE et non à l'heure : chercher un car est un geste du
   * quotidien, pas une rafale. Cinq essais gratuits laissent le temps de
   * comprendre à quoi ça sert ; au-delà, c'est un usage régulier, et un usage
   * régulier vaut un abonnement. Les administrateurs ne sont jamais comptés.
   */
  transport_dictee: {
    basic: {
      limit: 5,
      windowMs: DAY,
      message: 'Vous avez utilisé vos 5 recherches vocales du jour. Passez Habitants pour 20 par jour.',
    },
    habitants: {
      limit: 20,
      windowMs: DAY,
      message: 'Quota de recherches vocales atteint (20 par jour).',
    },
    pro: {
      limit: 20,
      windowMs: DAY,
      message: 'Quota de recherches vocales atteint (20 par jour).',
    },
  },
  ai_extract: {
    basic: {
      limit: 5,
      windowMs: HOUR,
      message: 'Quota IA atteint (5/h). Passe Habitants pour 30/h.',
    },
    habitants: {
      limit: 30,
      windowMs: HOUR,
      message: 'Quota IA atteint (30/h). Réessaie dans 1 heure.',
    },
    pro: {
      limit: 30,
      windowMs: HOUR,
      message: 'Quota IA atteint (30/h). Réessaie dans 1 heure.',
    },
  },
  create_event: {
    basic:     { limit: 20, windowMs: DAY, message: 'Tu as soumis trop d\'événements aujourd\'hui. Réessaie demain.' },
    habitants: { limit: 20, windowMs: DAY, message: 'Tu as soumis trop d\'événements aujourd\'hui. Réessaie demain.' },
    pro:       { limit: 20, windowMs: DAY, message: 'Tu as soumis trop d\'événements aujourd\'hui. Réessaie demain.' },
  },
  article_like: {
    basic:     { limit: 60, windowMs: HOUR, message: 'Trop de likes en peu de temps. Réessaie dans 1 heure.' },
    habitants: { limit: 60, windowMs: HOUR, message: 'Trop de likes en peu de temps. Réessaie dans 1 heure.' },
    pro:       { limit: 60, windowMs: HOUR, message: 'Trop de likes en peu de temps. Réessaie dans 1 heure.' },
  },
  article_comment: {
    basic:     { limit: 10, windowMs: HOUR, message: 'Trop de commentaires en peu de temps. Réessaie dans 1 heure.' },
    habitants: { limit: 30, windowMs: HOUR, message: 'Trop de commentaires en peu de temps. Réessaie dans 1 heure.' },
    pro:       { limit: 30, windowMs: HOUR, message: 'Trop de commentaires en peu de temps. Réessaie dans 1 heure.' },
  },
  create_article: {
    basic:     { limit: 3,  windowMs: DAY, message: 'Trop d\'articles soumis aujourd\'hui. Réessaie demain.' },
    habitants: { limit: 5,  windowMs: DAY, message: 'Trop d\'articles soumis aujourd\'hui. Réessaie demain.' },
    pro:       { limit: 10, windowMs: DAY, message: 'Trop d\'articles soumis aujourd\'hui. Réessaie demain.' },
  },
  create_comment: {
    basic:     { limit: 30, windowMs: HOUR, message: 'Trop de commentaires. Réessaie dans 1 heure.' },
    habitants: { limit: 60, windowMs: HOUR, message: 'Trop de commentaires. Réessaie dans 1 heure.' },
    pro:       { limit: 60, windowMs: HOUR, message: 'Trop de commentaires. Réessaie dans 1 heure.' },
  },
  // Google Places autocomplete — facturé chaque frappe sans session token.
  // Limite confort de saisie : ~100/h suffit pour le user normal qui crée
  // un commerce / event ; bloque les bots / runaways React.
  places_autocomplete: {
    basic:     { limit: 100, windowMs: HOUR, message: 'Trop de recherches. Réessaie dans 1 heure.' },
    habitants: { limit: 100, windowMs: HOUR, message: 'Trop de recherches. Réessaie dans 1 heure.' },
    pro:       { limit: 100, windowMs: HOUR, message: 'Trop de recherches. Réessaie dans 1 heure.' },
  },
  // Google Geocoding — facturé par requête. 30/jour/user : large pour ne
  // pas gêner un placement payant (création fiche commerce), serré pour
  // garder la facture Google sous contrôle.
  geocode: {
    basic:     { limit: 30, windowMs: DAY, message: 'Trop de géocodages aujourd\'hui. Réessaie demain.' },
    habitants: { limit: 30, windowMs: DAY, message: 'Trop de géocodages aujourd\'hui. Réessaie demain.' },
    pro:       { limit: 30, windowMs: DAY, message: 'Trop de géocodages aujourd\'hui. Réessaie demain.' },
  },
  // Édition vocale Claude — tokens IA coûteux. 20/jour pour anti-abus.
  voice_edit: {
    basic:     { limit: 20, windowMs: DAY, message: 'Quota édition vocale atteint (20/jour). Réessaie demain.' },
    habitants: { limit: 20, windowMs: DAY, message: 'Quota édition vocale atteint (20/jour). Réessaie demain.' },
    pro:       { limit: 20, windowMs: DAY, message: 'Quota édition vocale atteint (20/jour). Réessaie demain.' },
  },
  // Preview de lien (fetch OG serveur) — anti-abus, confortable pour coller
  // quelques liens par message.
  link_preview: {
    basic:     { limit: 120, windowMs: HOUR, message: 'Trop de liens en peu de temps. Réessaie dans 1 heure.' },
    habitants: { limit: 120, windowMs: HOUR, message: 'Trop de liens en peu de temps. Réessaie dans 1 heure.' },
    pro:       { limit: 120, windowMs: HOUR, message: 'Trop de liens en peu de temps. Réessaie dans 1 heure.' },
  },
  // Réservé Pro/admin (gating route). Plafond large pour l'édition fluide
  // (régénération auto), mais coupe tout emballement CPU.
  poster_generate: {
    basic:     { limit: 150, windowMs: HOUR, message: 'Trop de générations d\'affiche. Réessaie dans 1 heure.' },
    habitants: { limit: 150, windowMs: HOUR, message: 'Trop de générations d\'affiche. Réessaie dans 1 heure.' },
    pro:       { limit: 150, windowMs: HOUR, message: 'Trop de générations d\'affiche. Réessaie dans 1 heure.' },
  },
  // Texte réseaux (Claude) : peu d'appels nécessaires (1 par export).
  poster_caption: {
    basic:     { limit: 30, windowMs: HOUR, message: 'Trop de textes générés. Réessaie dans 1 heure.' },
    habitants: { limit: 30, windowMs: HOUR, message: 'Trop de textes générés. Réessaie dans 1 heure.' },
    pro:       { limit: 30, windowMs: HOUR, message: 'Trop de textes générés. Réessaie dans 1 heure.' },
  },
  // Anti-script, PAS le quota produit : le nombre de conversations offertes
  // se règle dans config('assistant_quotas'). Ce plafond-ci compte les
  // messages et n'existe que pour empêcher une boucle automatisée. Il est
  // donc large : un humain ne l'atteint pas en conversant.
  assistant: {
    basic:     { limit: 60,  windowMs: HOUR, message: 'Trop de messages d’affilée. Réessayez dans un moment.' },
    habitants: { limit: 120, windowMs: HOUR, message: 'Trop de messages d’affilée. Réessayez dans un moment.' },
    pro:       { limit: 120, windowMs: HOUR, message: 'Trop de messages d’affilée. Réessayez dans un moment.' },
  },
}

export function getRule(action: RateLimitAction, plan: Plan): RateLimitRule {
  return RATE_LIMITS_BY_PLAN[action][plan]
}

export interface RateLimitResult {
  ok: boolean
  count: number
  limit: number
  retryAfterSeconds: number
  message: string
}

/**
 * Vérifie si un user peut faire une action sans dépasser le plafond.
 * `isAdmin=true` bypass tout. Si la check Supabase échoue, on autorise
 * (fail-open : ne pas bloquer l'app si la table est down).
 */
export async function checkRateLimit(
  userId: string,
  action: RateLimitAction,
  rule: RateLimitRule,
  isAdmin = false,
): Promise<RateLimitResult> {
  if (isAdmin) {
    return { ok: true, count: 0, limit: rule.limit, retryAfterSeconds: 0, message: rule.message }
  }

  const since = new Date(Date.now() - rule.windowMs).toISOString()

  const { count, error } = await supabaseAdmin
    .from('api_rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('action', action)
    .gte('called_at', since)

  if (error) {
    console.error('[rateLimit] check error:', error.message)
    // fail-open : on autorise
    return { ok: true, count: 0, limit: rule.limit, retryAfterSeconds: 0, message: rule.message }
  }

  const used = count ?? 0
  const ok = used < rule.limit
  return {
    ok,
    count: used,
    limit: rule.limit,
    retryAfterSeconds: ok ? 0 : Math.ceil(rule.windowMs / 1000),
    message: rule.message,
  }
}

/**
 * Log un appel API dans la table d'audit. Fail-silent.
 */
export async function logApiCall(userId: string, action: RateLimitAction): Promise<void> {
  const { error } = await supabaseAdmin
    .from('api_rate_limits')
    .insert({ user_id: userId, action })
  if (error) console.error('[rateLimit] log error:', error.message)
}

/**
 * Helper qui combine getRule + checkRateLimit + logApiCall en un seul appel :
 *  - récupère la règle selon le plan du user
 *  - check
 *  - si pas ok → renvoie une Response 429
 *  - si ok → log et renvoie null (route continue normalement)
 *
 * Usage :
 *   const blocked = await rateLimit(ctx.userId, 'ai_extract', ctx.plan, ctx.isAdmin)
 *   if (blocked) return blocked
 */
export async function rateLimit(
  userId: string,
  action: RateLimitAction,
  plan: Plan,
  isAdmin = false,
): Promise<Response | null> {
  const rule = getRule(action, plan)
  const res = await checkRateLimit(userId, action, rule, isAdmin)
  if (!res.ok) {
    return rateLimitResponse(res)
  }
  await logApiCall(userId, action)
  return null
}

export function rateLimitResponse(res: RateLimitResult): Response {
  return NextResponse.json(
    { error: res.message, rateLimitExceeded: true, retryAfterSeconds: res.retryAfterSeconds },
    {
      status: 429,
      headers: {
        'Retry-After': String(res.retryAfterSeconds),
      },
    },
  )
}

/**
 * Compte les lignes récentes dans une table arbitraire (events, annonces…)
 * pour les quotas qui s'appuient sur le contenu réel plutôt que sur les
 * appels API. Utilisé pour : "max 10 annonces basic par semaine" (compte
 * les annonces réellement créées, pas les tentatives).
 */
export async function countRecentInTable(
  table: string,
  userIdColumn: string,
  userId: string,
  windowMs: number,
): Promise<number> {
  const since = new Date(Date.now() - windowMs).toISOString()
  const { count, error } = await supabaseAdmin
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq(userIdColumn, userId)
    .gte('created_at', since)
  if (error) {
    console.error(`[rateLimit] countRecentInTable(${table}) error:`, error.message)
    return 0 // fail-open
  }
  return count ?? 0
}
