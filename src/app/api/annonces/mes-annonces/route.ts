import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

/**
 * GET — toutes les annonces du user connecté, tous statuts confondus.
 * Triées par date de création décroissante.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { data, error } = await supabaseAdmin
    .from('annonces')
    .select('*')
    .eq('user_id', ctx.userId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ annonces: data ?? [] })
}
