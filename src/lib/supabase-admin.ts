import { createClient } from '@supabase/supabase-js'

// Client côté serveur uniquement — utilise la service role key (bypass RLS)
// NE PAS importer ce fichier dans des composants client ('use client')
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)
