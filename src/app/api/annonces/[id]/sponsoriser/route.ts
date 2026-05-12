import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'
import { getQuotaSponsoring, SPONSORING_DUREE_JOURS } from '@/lib/annonces'

/**
 * POST — sponsorise une annonce pendant SPONSORING_DUREE_JOURS jours.
 *
 * Règles :
 *  - owner uniquement
 *  - quota : Pro = 1, Max = 3, Basic = 0
 *  - l'annonce doit être active
 *
 * Pose : sponsored = true, sponsored_until = now + 5j.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const quota = getQuotaSponsoring(ctx.plan)
  if (quota === 0 && !ctx.isAdmin) {
    return NextResponse.json({ error: 'Plan Pro ou Max requis pour sponsoriser' }, { status: 403 })
  }

  const { data: annonce } = await supabaseAdmin
    .from('annonces')
    .select('user_id, statut, sponsored')
    .eq('id', id)
    .maybeSingle()

  if (!annonce) return NextResponse.json({ error: 'Annonce introuvable' }, { status: 404 })
  if (annonce.user_id !== ctx.userId && !ctx.isAdmin) {
    return NextResponse.json({ error: 'Interdit' }, { status: 403 })
  }
  if (annonce.statut !== 'active') {
    return NextResponse.json({ error: 'Annonce non active' }, { status: 409 })
  }
  if (annonce.sponsored) {
    return NextResponse.json({ error: 'Annonce déjà sponsorisée' }, { status: 409 })
  }

  // Vérif quota : nombre de sponsorings actifs du user
  if (!ctx.isAdmin) {
    const { count } = await supabaseAdmin
      .from('annonces')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', ctx.userId)
      .eq('sponsored', true)
      .gt('sponsored_until', new Date().toISOString())

    if ((count ?? 0) >= quota) {
      return NextResponse.json(
        { error: `Quota atteint : ${quota} annonce(s) sponsorisée(s) max pour le plan ${ctx.plan}` },
        { status: 429 },
      )
    }
  }

  const sponsored_until = new Date(Date.now() + SPONSORING_DUREE_JOURS * 24 * 60 * 60 * 1000).toISOString()

  const { error } = await supabaseAdmin
    .from('annonces')
    .update({ sponsored: true, sponsored_until })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, sponsored_until })
}
