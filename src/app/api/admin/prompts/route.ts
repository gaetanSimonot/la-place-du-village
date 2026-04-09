import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { invalidatePrompt } from '@/lib/prompts-ia'

// GET /api/admin/prompts → liste tous les prompts
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('prompts_ia')
    .select('id, nom, description, systeme, updated_at')
    .order('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// PATCH /api/admin/prompts → met à jour un prompt { id, systeme }
export async function PATCH(req: NextRequest) {
  const { id, systeme } = await req.json()

  if (!id || typeof systeme !== 'string') {
    return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('prompts_ia')
    .update({ systeme, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Vide le cache pour que la nouvelle version soit prise immédiatement
  invalidatePrompt(id)

  return NextResponse.json({ success: true })
}
