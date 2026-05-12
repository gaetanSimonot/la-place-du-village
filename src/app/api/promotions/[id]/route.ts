import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

/**
 * PATCH — modifie une promo (créateur seulement)
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { data: promo } = await supabaseAdmin
    .from('promotions')
    .select('user_id')
    .eq('id', id)
    .maybeSingle()

  if (!promo) return NextResponse.json({ error: 'Non trouvée' }, { status: 404 })
  if (promo.user_id !== ctx.userId && !ctx.isAdmin) {
    return NextResponse.json({ error: 'Interdit' }, { status: 403 })
  }

  const body = await req.json()
  const allowed = ['title', 'description', 'image_url', 'conditions', 'frequency', 'valid_from', 'valid_until', 'active']
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of allowed) {
    if (k in body) patch[k] = body[k] === '' ? null : body[k]
  }

  if (patch.frequency && !['always', 'weekly', 'monthly'].includes(patch.frequency as string)) {
    return NextResponse.json({ error: 'frequency invalide' }, { status: 400 })
  }

  const { error } = await supabaseAdmin.from('promotions').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

/**
 * DELETE — supprime une promo (créateur ou admin)
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { data: promo } = await supabaseAdmin
    .from('promotions')
    .select('user_id')
    .eq('id', id)
    .maybeSingle()

  if (!promo) return NextResponse.json({ error: 'Non trouvée' }, { status: 404 })
  if (promo.user_id !== ctx.userId && !ctx.isAdmin) {
    return NextResponse.json({ error: 'Interdit' }, { status: 403 })
  }

  const { error } = await supabaseAdmin.from('promotions').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
