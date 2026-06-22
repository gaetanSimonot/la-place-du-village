import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

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
