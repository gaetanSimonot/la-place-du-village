import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

export async function PATCH(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const body = await req.json().catch(() => ({}))
  const { display_name, genre, banner_url, avatar_url, is_public, searchable, bio, ville, link_url } = body

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

  // avatar_url : même validation que banner_url (URL Supabase Storage)
  if (avatar_url !== undefined) {
    if (avatar_url === null || avatar_url === '') {
      update.avatar_url = null
    } else if (typeof avatar_url === 'string') {
      const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
      if (!avatar_url.startsWith(supaUrl + '/storage/v1/object/public/')) {
        return NextResponse.json({ error: 'avatar_url invalide' }, { status: 400 })
      }
      update.avatar_url = avatar_url
    } else {
      return NextResponse.json({ error: 'avatar_url invalide' }, { status: 400 })
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

  // bio : null, "" (= clear) ou string, 500 chars max
  if (bio !== undefined) {
    if (bio === null || bio === '') {
      update.bio = null
    } else if (typeof bio === 'string') {
      if (bio.length > 500) {
        return NextResponse.json({ error: 'Bio trop longue (max 500 caractères)' }, { status: 400 })
      }
      update.bio = bio.trim()
    } else {
      return NextResponse.json({ error: 'bio invalide' }, { status: 400 })
    }
  }

  // ville : null, "" (= clear) ou string, 80 chars max
  if (ville !== undefined) {
    if (ville === null || ville === '') {
      update.ville = null
    } else if (typeof ville === 'string') {
      if (ville.length > 80) {
        return NextResponse.json({ error: 'Localisation trop longue (max 80 caractères)' }, { status: 400 })
      }
      update.ville = ville.trim()
    } else {
      return NextResponse.json({ error: 'ville invalide' }, { status: 400 })
    }
  }

  // link_url : null, "" (= clear), ou URL http(s):// stricte, 500 chars max
  if (link_url !== undefined) {
    if (link_url === null || link_url === '') {
      update.link_url = null
    } else if (typeof link_url === 'string') {
      const trimmed = link_url.trim()
      if (trimmed.length > 500) {
        return NextResponse.json({ error: 'Lien trop long (max 500 caractères)' }, { status: 400 })
      }
      try {
        const u = new URL(trimmed)
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
          return NextResponse.json({ error: 'Lien doit commencer par http:// ou https://' }, { status: 400 })
        }
      } catch {
        return NextResponse.json({ error: 'Lien invalide' }, { status: 400 })
      }
      update.link_url = trimmed
    } else {
      return NextResponse.json({ error: 'link_url invalide' }, { status: 400 })
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
