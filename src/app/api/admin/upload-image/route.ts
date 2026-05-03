import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  const { base64, mimeType = 'image/jpeg' } = await req.json()
  if (!base64) return NextResponse.json({ error: 'base64 requis' }, { status: 400 })

  const buffer = Buffer.from(base64, 'base64')
  const ext = mimeType.split('/')[1]?.split(';')[0] || 'jpg'
  const filename = `edits/${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${ext}`

  const { error } = await supabaseAdmin.storage
    .from('event-images')
    .upload(filename, buffer, { contentType: mimeType, upsert: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: { publicUrl } } = supabaseAdmin.storage
    .from('event-images')
    .getPublicUrl(filename)

  return NextResponse.json({ url: publicUrl })
}
