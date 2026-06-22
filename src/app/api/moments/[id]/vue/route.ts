import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'

/**
 * POST /api/moments/[id]/vue — marque un moment comme vu par l'utilisateur
 * courant (upsert idempotent). Sert à passer la bordure orange en grise.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { error } = await supabaseAdmin
    .from('moment_vues')
    .upsert({ moment_id: params.id, user_id: ctx.userId }, { onConflict: 'moment_id,user_id', ignoreDuplicates: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
