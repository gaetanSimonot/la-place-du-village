import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

export async function PATCH(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const body = await req.json().catch(() => ({}))
  const { display_name, genre } = body

  const update: Record<string, unknown> = {}

  // display_name reste optionnel mais validé si fourni
  if (display_name !== undefined) {
    if (typeof display_name !== 'string' || !display_name.trim()) {
      return NextResponse.json({ error: 'Nom invalide' }, { status: 400 })
    }
    update.display_name = display_name.trim()
  }

  // genre : null (= "Préfère ne pas dire") ou 'homme' | 'femme' | 'autre'
  if (genre !== undefined) {
    if (genre === null || genre === '') {
      update.genre = null
    } else if (genre === 'homme' || genre === 'femme' || genre === 'autre') {
      update.genre = genre
    } else {
      return NextResponse.json({ error: 'Genre invalide' }, { status: 400 })
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Rien à modifier' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(update)
    .eq('user_id', ctx.userId)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ profile: data })
}
