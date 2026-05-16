import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'
import type { FeaturedSlot, FeaturedContentType } from '@/lib/featured'
import { SLOT_ALLOWED_TYPES } from '@/lib/featured'

/**
 * POST — consomme 1 crédit pro et crée un featured_slot.
 *
 * Réservé aux pros (slots_total > 0).
 * Le user doit posséder le contenu (sauf admin qui passe par /api/featured-slots).
 *
 * Body : { slot, content_type, content_id, duration_hours }
 *   - duration_hours = nombre de jours × 24 (typiquement 24, 48, 72…)
 */
export async function POST(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const body = await req.json().catch(() => ({}))
  const slot           = body?.slot as FeaturedSlot
  const content_type   = body?.content_type as FeaturedContentType
  const content_id     = body?.content_id as string
  const duration_hours = Math.max(1, Math.min(168, Number(body?.duration_hours ?? 24)))

  if (!slot || !content_type || !content_id) {
    return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })
  }
  if (!(SLOT_ALLOWED_TYPES[slot] ?? []).includes(content_type)) {
    return NextResponse.json({ error: 'Ce type de contenu n\'est pas autorisé pour ce slot' }, { status: 400 })
  }

  // Vérifier ownership du contenu (sauf admin)
  if (!ctx.isAdmin) {
    const ok = await assertOwnership(content_type, content_id, ctx.userId)
    if (!ok) return NextResponse.json({ error: 'Vous ne pouvez pas mettre en avant ce contenu' }, { status: 403 })
  }

  // Vérifier crédit dispo
  const { data: credits } = await supabaseAdmin
    .from('feature_credits')
    .select('*')
    .eq('user_id', ctx.userId)
    .maybeSingle()

  const remaining = credits ? credits.slots_total - credits.slots_used : 0
  if (remaining <= 0) {
    return NextResponse.json({ error: 'Aucun crédit disponible. Passez par un boost payant ou attendez le reset mensuel.' }, { status: 402 })
  }

  // Décrémente le crédit + crée le slot — séquentiel (pas de transaction côté Supabase JS, on assume succès)
  const { error: updErr } = await supabaseAdmin
    .from('feature_credits')
    .update({ slots_used: credits!.slots_used + 1, updated_at: new Date().toISOString() })
    .eq('user_id', ctx.userId)

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  const startsAt = new Date()
  const endsAt   = new Date(startsAt.getTime() + duration_hours * 3600 * 1000)

  const { data: slotRow, error: insErr } = await supabaseAdmin
    .from('featured_slots')
    .insert({
      slot,
      content_type,
      content_id,
      starts_at:        startsAt.toISOString(),
      ends_at:          endsAt.toISOString(),
      priority:         0,
      sponsored:        false,
      source:           'pro_credit',
      created_by:        ctx.userId,
      created_by_admin:  false,
    })
    .select()
    .single()

  if (insErr) {
    // Rollback du crédit (best-effort)
    await supabaseAdmin
      .from('feature_credits')
      .update({ slots_used: credits!.slots_used, updated_at: new Date().toISOString() })
      .eq('user_id', ctx.userId)
    return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  return NextResponse.json({ slot: slotRow, credits_remaining: remaining - 1 })
}

async function assertOwnership(contentType: FeaturedContentType, contentId: string, userId: string): Promise<boolean> {
  switch (contentType) {
    case 'evenement': {
      const { data } = await supabaseAdmin.from('evenements').select('user_id').eq('id', contentId).maybeSingle()
      return data?.user_id === userId
    }
    case 'etablissement': {
      const { data } = await supabaseAdmin.from('etablissements').select('user_id').eq('id', contentId).maybeSingle()
      return data?.user_id === userId
    }
    case 'producteur': {
      const { data } = await supabaseAdmin.from('producers').select('user_id').eq('id', contentId).maybeSingle()
      return data?.user_id === userId
    }
    case 'annonce': {
      const { data } = await supabaseAdmin.from('annonces').select('user_id').eq('id', contentId).maybeSingle()
      return data?.user_id === userId
    }
    case 'promotion': {
      const { data } = await supabaseAdmin
        .from('promotions')
        .select('etablissement_id')
        .eq('id', contentId)
        .maybeSingle()
      if (!data?.etablissement_id) return false
      const { data: etab } = await supabaseAdmin
        .from('etablissements')
        .select('user_id')
        .eq('id', data.etablissement_id)
        .maybeSingle()
      return etab?.user_id === userId
    }
    default:
      return false
  }
}
