import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

type PrivacyOption = 'public' | 'search_only' | 'masque'

// 3 options du radio UI mappées sur les 2 booléens existants
// (is_public, searchable). Le 4e cas (public mais non searchable) n'a
// pas de sens et n'est volontairement pas exposé.
//
// Sémantique : les 2 booléens contrôlent la DÉCOUVRABILITÉ (annuaire
// + recherche), pas la lecture du profil — un visiteur avec le lien
// direct verra toujours la fiche (la policy RLS profiles reste ouverte).
const PRIVACY_MAP: Record<PrivacyOption, { is_public: boolean; searchable: boolean }> = {
  public:      { is_public: true,  searchable: true  },
  search_only: { is_public: false, searchable: true  },
  masque:      { is_public: false, searchable: false },
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const body = await req.json().catch(() => ({}))
  const { option } = body as { option?: unknown }

  if (typeof option !== 'string' || !(option in PRIVACY_MAP)) {
    return NextResponse.json({ error: 'Option invalide' }, { status: 400 })
  }

  const update = PRIVACY_MAP[option as PrivacyOption]

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(update)
    .eq('user_id', ctx.userId)
    .select('is_public, searchable')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ option, ...data })
}
