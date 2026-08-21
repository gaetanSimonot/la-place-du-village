import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/server-auth'

/**
 * PATCH /api/admin/etablissements/[id]/module-cinema  { actif: boolean }
 *
 * Accorde ou retire le module Cinéma à une fiche. Réservé aux admins : ce
 * n'est pas une option publique, elle ne s'achète pas et n'apparaît dans
 * aucun abonnement.
 *
 * Les deux autres conditions (fiche revendiquée, plan Pro) ne sont PAS
 * vérifiées ici : on doit pouvoir accorder le module avant que le cinéma
 * n'ait fini de s'abonner. C'est peutAdministrerCinema(), au moment d'agir,
 * qui exige les trois ensemble.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const body = await req.json().catch(() => ({}))
  const actif = body?.actif === true

  const { error } = await supabaseAdmin
    .from('etablissements')
    .update({ module_cinema: actif })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, module_cinema: actif })
}
