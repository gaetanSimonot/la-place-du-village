import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * Client Supabase browser.
 *
 * `flowType: 'pkce'` est EXPLICITE — sans ca, supabase-js v2 peut tomber en
 * "implicit" flow (tokens en URL fragment #access_token=...) selon les
 * versions et configs. Notre /auth/callback lit `?code=...` (query param),
 * donc on doit forcer PKCE pour que le code arrive ou attendu.
 *
 * `detectSessionInUrl: true` -> supabase-js parse automatiquement
 * `?code=...` au retour OAuth et appelle exchangeCodeForSession en interne.
 * On garde notre call manuel dans /auth/callback comme filet de securite.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  },
})
