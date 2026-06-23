import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/server-auth'

/**
 * Brouillon de newsletter sauvegardé côté SERVEUR (table config, clé
 * 'newsletter_draft'). Permet de configurer une fois et de retrouver son
 * montage toujours prêt, sur n'importe quel appareil. Les sections "auto"
 * affichent le contenu de la semaine en cours à chaque ouverture.
 *
 * GET → { draft } (objet ou null)
 * PUT { subject, blocks, invite, inviteSubject } → sauvegarde
 */
const KEY = 'newsletter_draft'

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx
  const { data } = await supabaseAdmin.from('config').select('value').eq('key', KEY).maybeSingle()
  let draft = null
  try { draft = data?.value ? JSON.parse(data.value) : null } catch { draft = null }
  return NextResponse.json({ draft })
}

export async function PUT(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'corps invalide' }, { status: 400 })
  const value = JSON.stringify({
    subject: String(body.subject ?? ''),
    inviteSubject: String(body.inviteSubject ?? ''),
    blocks: Array.isArray(body.blocks) ? body.blocks : [],
    invite: body.invite ?? null,
  })
  const { error } = await supabaseAdmin.from('config').upsert({ key: KEY, value }, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
