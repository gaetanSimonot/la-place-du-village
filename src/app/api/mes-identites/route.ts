import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'
import { IDENTITE_ETAB_SELECT, type EtabIdentite } from '@/lib/identite'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/mes-identites
 *
 * Les identités sous lesquelles le user courant peut publier : son profil
 * personnel (toujours) + une entrée par fiche établissement qui LUI est
 * attribuée.
 *
 * Pas de passe-droit admin ici : un admin ne voit que ses propres fiches,
 * sinon le sélecteur listerait tout le village.
 *
 * Renvoie : { identites: [{ id, nom, avatar }] }  — `id: null` = profil perso.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const [{ data: profil }, { data: etabs }] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('user_id', ctx.userId)
      .maybeSingle(),
    supabaseAdmin
      .from('etablissements')
      .select(IDENTITE_ETAB_SELECT)
      .eq('user_id', ctx.userId)
      .order('nom'),
  ])

  const perso = {
    id:     null,
    nom:    (profil as { display_name: string | null } | null)?.display_name?.trim() || 'Moi',
    avatar: (profil as { avatar_url: string | null } | null)?.avatar_url ?? null,
  }

  const fiches = ((etabs ?? []) as EtabIdentite[]).map(e => ({
    id:     e.id,
    nom:    e.nom,
    avatar: e.photos?.[0] ?? null,
  }))

  return NextResponse.json(
    { identites: [perso, ...fiches] },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
