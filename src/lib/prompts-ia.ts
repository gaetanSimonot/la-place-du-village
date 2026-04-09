import { supabaseAdmin } from './supabase-admin'

// Cache en mémoire — TTL 60 s (rechargement à chaud sans redéploiement)
const cache = new Map<string, { text: string; at: number }>()
const TTL = 60_000

/**
 * Charge un prompt depuis Supabase et remplace les variables {{clé}}.
 * Les variables dynamiques courantes :
 *   {{today}}        → date du jour en français (injectée par l'appelant)
 *   {{currentForm}}  → état JSON du formulaire  (voice-edit)
 *   {{transcript}}   → transcription vocale      (voice-edit)
 */
export async function getPrompt(id: string, vars: Record<string, string> = {}): Promise<string> {
  const now = Date.now()
  const cached = cache.get(id)
  if (cached && now - cached.at < TTL) {
    return applyVars(cached.text, vars)
  }

  const { data, error } = await supabaseAdmin
    .from('prompts_ia')
    .select('systeme')
    .eq('id', id)
    .single()

  if (error || !data?.systeme) {
    throw new Error(`Prompt IA '${id}' introuvable en base`)
  }

  cache.set(id, { text: data.systeme, at: now })
  return applyVars(data.systeme, vars)
}

/** Invalide le cache pour un prompt (appelé après édition admin) */
export function invalidatePrompt(id: string) {
  cache.delete(id)
}

function applyVars(text: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (t, [k, v]) => t.replaceAll(`{{${k}}}`, v),
    text
  )
}
