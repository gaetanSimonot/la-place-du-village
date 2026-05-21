import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

export async function PATCH(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const body = await req.json().catch(() => ({}))
  const { display_name, genre, banner_url, is_public, searchable } = body

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

  // banner_url : null (= retire la bannière) ou string URL Supabase
  if (banner_url !== undefined) {
    if (banner_url === null || banner_url === '') {
      update.banner_url = null
    } else if (typeof banner_url === 'string') {
      // Anti-injection : doit pointer vers notre Supabase Storage (pas une URL arbitraire)
      const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
      if (!banner_url.startsWith(supaUrl + '/storage/v1/object/public/')) {
        return NextResponse.json({ error: 'banner_url invalide' }, { status: 400 })
      }
      update.banner_url = banner_url
    } else {
      return NextResponse.json({ error: 'banner_url invalide' }, { status: 400 })
    }
  }

  // is_public : boolean strict
  if (is_public !== undefined) {
    if (typeof is_public !== 'boolean') {
      return NextResponse.json({ error: 'is_public doit être booléen' }, { status: 400 })
    }
    update.is_public = is_public
  }

  // searchable : boolean strict
  if (searchable !== undefined) {
    if (typeof searchable !== 'boolean') {
      return NextResponse.json({ error: 'searchable doit être booléen' }, { status: 400 })
    }
    update.searchable = searchable
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
