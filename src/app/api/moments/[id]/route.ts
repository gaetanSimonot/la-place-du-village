import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'
import { can } from '@/lib/capabilities'

/**
 * PATCH /api/moments/[id] — édite un moment (auteur ou admin).
 * Body : { legende?: string|null, sur_accueil?: boolean }
 *  - legende     : modifie la légende.
 *  - sur_accueil : promeut (true, payant/admin, un seul à la fois, +24h) ou
 *                  retire (false) le reel du fil d'accueil du village.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { data: moment } = await supabaseAdmin
    .from('moments').select('id, auteur_id, sur_accueil').eq('id', params.id).maybeSingle()
  if (!moment) return NextResponse.json({ error: 'Moment introuvable' }, { status: 404 })
  if (moment.auteur_id !== ctx.userId && !ctx.isAdmin) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const patch: Record<string, unknown> = {}

  if (typeof body.legende === 'string') patch.legende = body.legende.slice(0, 500).trim() || null
  else if (body.legende === null) patch.legende = null

  if (body.sur_accueil === true) {
    if (!can(ctx, 'publish_moment')) {
      return NextResponse.json({ error: 'Promotion accueil réservée aux comptes Habitants/Partenaires' }, { status: 403 })
    }
    // Plafond accueil : admin illimité, payants 2 reels actifs à la fois.
    if (!ctx.isAdmin && moment.sur_accueil !== true) {
      const { count } = await supabaseAdmin
        .from('moments')
        .select('id', { count: 'exact', head: true })
        .eq('auteur_id', moment.auteur_id)
        .eq('sur_accueil', true)
        .gt('expires_at', new Date().toISOString())
        .neq('id', params.id)
      if ((count ?? 0) >= 2) {
        return NextResponse.json({ error: 'Tu as déjà 2 reels sur l’accueil. Retires-en un d’abord.' }, { status: 409 })
      }
    }
    patch.sur_accueil = true
    patch.expires_at = new Date(Date.now() + 24 * 3600 * 1000).toISOString()  // relance la fenêtre 24h
  } else if (body.sur_accueil === false) {
    patch.sur_accueil = false
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ success: true })

  const { data, error } = await supabaseAdmin
    .from('moments').update(patch).eq('id', params.id).select('id, legende, sur_accueil').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, moment: data })
}

/**
 * DELETE /api/moments/[id] — supprime un moment. Autorisé à son auteur ou à
 * un admin. Le média Storage est nettoyé au passage (best-effort).
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { data: moment } = await supabaseAdmin
    .from('moments')
    .select('id, auteur_id, media_url')
    .eq('id', params.id)
    .maybeSingle()
  if (!moment) return NextResponse.json({ error: 'Moment introuvable' }, { status: 404 })

  if (moment.auteur_id !== ctx.userId && !ctx.isAdmin) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const { error } = await supabaseAdmin.from('moments').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Nettoyage du média (best-effort) : extrait le path après /public/moments/
  const marker = '/storage/v1/object/public/moments/'
  const idx = (moment.media_url as string).indexOf(marker)
  if (idx !== -1) {
    const path = (moment.media_url as string).slice(idx + marker.length)
    await supabaseAdmin.storage.from('moments').remove([path]).catch(() => {})
  }

  return NextResponse.json({ success: true })
}
