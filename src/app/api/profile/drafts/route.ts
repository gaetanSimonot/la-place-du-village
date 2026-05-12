import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

/**
 * Liste les brouillons d'établissements du user connecté.
 * Pour chaque draft, indique si l'user gère encore cette fiche
 * (managed=true) ou si c'est un brouillon abandonné (managed=false).
 */
export async function GET(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { data: drafts } = await supabaseAdmin
    .from('etablissement_drafts')
    .select('id, etablissement_id, fields, updated_at')
    .eq('user_id', ctx.userId)
    .order('updated_at', { ascending: false })

  if (!drafts || !drafts.length) return NextResponse.json({ drafts: [] })

  const etabIds = drafts.map(d => d.etablissement_id)
  const { data: etabs } = await supabaseAdmin
    .from('etablissements')
    .select('id, nom, commune, type, photos, user_id, plan')
    .in('id', etabIds)

  const etabsById: Record<string, { id: string; nom: string; commune: string | null; type: string | null; photos: string[] | null; user_id: string | null; plan: string | null }> =
    Object.fromEntries((etabs ?? []).map(e => [e.id, e]))

  const list = drafts.map(d => {
    const etab = etabsById[d.etablissement_id]
    if (!etab) return null
    return {
      ...d,
      etablissement: etab,
      managed: etab.user_id === ctx.userId,
    }
  }).filter(Boolean)

  return NextResponse.json({ drafts: list })
}
