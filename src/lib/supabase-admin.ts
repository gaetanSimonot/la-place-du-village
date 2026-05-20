import { createClient } from '@supabase/supabase-js'

// Client côté serveur uniquement — utilise la service role key (bypass RLS).
// NE PAS importer ce fichier dans des composants client ('use client').
// `persistSession: false` + `autoRefreshToken: false` : on n a pas de
// session user a maintenir avec le service role (chaque request est
// authentifiee via le header Authorization en interne).
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
)
