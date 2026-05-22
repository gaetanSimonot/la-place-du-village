import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

const ALLOWED_KEYS = [
  'banner',
  'bio',
  'fiche_pro',
  'module_utile',
  'pages_suivies',
  'publications',
] as const

type AllowedKey = (typeof ALLOWED_KEYS)[number]
type DisplaySettings = Record<AllowedKey, boolean>

const DEFAULT_SETTINGS: DisplaySettings = {
  banner: true,
  bio: true,
  fiche_pro: true,
  module_utile: true,
  pages_suivies: false,
  publications: true,
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const body = await req.json().catch(() => ({}))
  const { key, value } = body as { key?: unknown; value?: unknown }

  if (typeof key !== 'string' || !(ALLOWED_KEYS as readonly string[]).includes(key)) {
    return NextResponse.json({ error: 'Clé invalide' }, { status: 400 })
  }
  if (typeof value !== 'boolean') {
    return NextResponse.json({ error: 'value doit être booléen' }, { status: 400 })
  }

  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from('profiles')
    .select('display_settings')
    .eq('user_id', ctx.userId)
    .maybeSingle()

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  const current: DisplaySettings = {
    ...DEFAULT_SETTINGS,
    ...((existing?.display_settings as Partial<DisplaySettings>) ?? {}),
  }
  const next: DisplaySettings = { ...current, [key as AllowedKey]: value }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ display_settings: next })
    .eq('user_id', ctx.userId)
    .select('display_settings')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ display_settings: data.display_settings })
}
