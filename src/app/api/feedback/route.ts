import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// POST /api/feedback
// Body: { evenement_id, evenement_titre, message, contact? }
// Auth: Bearer token user requis (anti-spam minimal).
// Insère dans `feedbacks` via le service role pour rester RLS-safe si on
// resserre les policies de la table plus tard.
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) {
    return NextResponse.json({ error: 'Connexion requise pour proposer une correction' }, { status: 401 })
  }

  const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token)
  if (userErr || !user) {
    return NextResponse.json({ error: 'Session invalide' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Payload JSON invalide' }, { status: 400 })

  const { evenement_id, evenement_titre, message, contact } = body
  if (!evenement_id || typeof evenement_id !== 'string') {
    return NextResponse.json({ error: 'evenement_id manquant' }, { status: 400 })
  }
  if (!message || typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'Message requis' }, { status: 400 })
  }
  if (message.length > 2000) {
    return NextResponse.json({ error: 'Message trop long (max 2000 caractères)' }, { status: 400 })
  }

  const { error: insertErr } = await supabaseAdmin
    .from('feedbacks')
    .insert({
      evenement_id,
      evenement_titre: typeof evenement_titre === 'string' ? evenement_titre.slice(0, 200) : null,
      message: message.trim().slice(0, 2000),
      contact: typeof contact === 'string' && contact.trim() ? contact.trim().slice(0, 200) : null,
    })

  if (insertErr) {
    console.error('[feedback] insert error:', insertErr.message)
    return NextResponse.json({ error: 'Erreur enregistrement' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
