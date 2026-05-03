import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { processMessage } from '@/lib/processMessage'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

async function uploadImage(base64: string, mimeType: string): Promise<string | null> {
  try {
    const buffer = Buffer.from(base64, 'base64')
    const ext = mimeType.split('/')[1]?.split(';')[0] || 'jpg'
    const filename = `inbox/${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${ext}`
    const { error } = await supabaseAdmin.storage
      .from('event-images')
      .upload(filename, buffer, { contentType: mimeType, upsert: false })
    if (error) return null
    return supabaseAdmin.storage.from('event-images').getPublicUrl(filename).data.publicUrl
  } catch { return null }
}

export async function POST(req: NextRequest) {
  const waKey = req.headers.get('x-wa-key')
  if (!waKey || waKey !== process.env.WHATSAPP_API_KEY) {
    return NextResponse.json({ error: 'Clé API invalide' }, { status: 401 })
  }

  const body = await req.json()
  const { source = 'whatsapp', groupe, auteur, contenu, image, imageMimeType, image_url } = body

  if (!contenu?.trim() && !image && !image_url) {
    return NextResponse.json({ error: 'Contenu ou image requis' }, { status: 400 })
  }

  let imageUrl: string | null = image_url ?? null
  if (image && !imageUrl) {
    imageUrl = await uploadImage(image, imageMimeType || 'image/jpeg')
  }

  const { data: msg, error: msgErr } = await supabaseAdmin
    .from('messages_entrants')
    .insert({
      source,
      groupe: groupe ?? null,
      auteur: auteur ?? null,
      contenu: contenu ?? null,
      image_url: imageUrl,
      statut: 'a_traiter',
    })
    .select('id')
    .single()

  if (msgErr || !msg) {
    return NextResponse.json({ error: 'Erreur insertion message' }, { status: 500 })
  }

  const result = await processMessage(msg.id, contenu ?? null, imageUrl, source, image ?? null, imageMimeType ?? null)

  await supabaseAdmin.from('messages_entrants').update({
    statut: result.statut,
    raison: result.raison || null,
    extraction: result.extraction ?? null,
    evenement_id: result.premier_evenement_id ?? null,
  }).eq('id', msg.id)

  return NextResponse.json({ ok: true, id: msg.id, ...result })
}
