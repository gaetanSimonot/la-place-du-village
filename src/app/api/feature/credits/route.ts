import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

/**
 * GET — retourne les crédits du user courant pour la période en cours.
 * Si pas de row → on en crée une (0 crédits par défaut, sauf si plan pro).
 */
export async function GET(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  // Période courante
  const periodStart = new Date()
  periodStart.setUTCDate(1); periodStart.setUTCHours(0, 0, 0, 0)
  const periodEnd = new Date(periodStart)
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1)

  const { data: existing } = await supabaseAdmin
    .from('feature_credits')
    .select('*')
    .eq('user_id', ctx.userId)
    .maybeSingle()

  // Si pas de row ou period_start obsolète, on (re)crée
  const periodStartStr = periodStart.toISOString().slice(0, 10)
  if (!existing || existing.period_start !== periodStartStr) {
    const slotsTotal = ctx.plan === 'pro' ? 3 : 0
    const periodEndStr = periodEnd.toISOString().slice(0, 10)

    const { data: upserted, error } = await supabaseAdmin
      .from('feature_credits')
      .upsert(
        {
          user_id:      ctx.userId,
          period_start: periodStartStr,
          period_end:   periodEndStr,
          slots_total:  slotsTotal,
          slots_used:   0,
        },
        { onConflict: 'user_id' },
      )
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ credits: upserted })
  }

  return NextResponse.json({ credits: existing })
}
