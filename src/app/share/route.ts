import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateImageFile } from '@/lib/imageUpload'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function POST(req: NextRequest) {
  const formData = await req.formData()

  const text  = formData.get('text')  as string | null
  const url   = formData.get('url')   as string | null
  const image = formData.get('image') as File   | null

  const combined = [text, url].filter(Boolean).join(' ').trim()
  const params   = new URLSearchParams()

  if (combined) params.set('share_text', combined)

  if (image && image.size > 0) {
    try {
      const v = await validateImageFile(image)
      if (v.ok) {
        const filename = `share/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${v.ext}`

        const { error } = await supabaseAdmin.storage
          .from('event-images')
          .upload(filename, v.buffer, { contentType: v.mimeType, upsert: false })

        if (!error) {
          const { data: { publicUrl } } = supabaseAdmin.storage
            .from('event-images')
            .getPublicUrl(filename)
          params.set('share_image', publicUrl)
        }
      }
    } catch { /* upload échoué — on continue sans image */ }
  }

  const base = req.nextUrl.origin
  return NextResponse.redirect(`${base}/capturer?${params.toString()}`, { status: 303 })
}
