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
  ai_extract: {
    basic: {
      limit: 5,
      windowMs: HOUR,
      message: 'Tu as utilisé tes 5 transcriptions IA gratuites de l\'heure. Passe Habitants pour en avoir 30/h.',
    },
    habitants: {
      limit: 30,
      windowMs: HOUR,
      message: 'Trop de transcriptions IA. Réessaie dans une heure.',
    },
    pro: {
      limit: 30,
      windowMs: HOUR,
      message: 'Trop de transcriptions IA. Réessaie dans une heure.',
    },
  },
  create_event: {
    basic:     { limit: 20, windowMs: DAY, message: 'Tu as soumis trop d\'événements aujourd\'hui. Réessaie demain.' },
    habitants: { limit: 20, windowMs: DAY, message: 'Tu as soumis trop d\'événements aujourd\'hui. Réessaie demain.' },
    pro:       { limit: 20, windowMs: DAY, message: 'Tu as soumis trop d\'événements aujourd\'hui. Réessaie demain.' },
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
