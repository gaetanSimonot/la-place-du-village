import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { validateImageUpload } from '@/lib/imageUpload'

async function isAdmin(req: NextRequest): Promise<boolean> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return false
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user?.email) return false
  const { data } = await supabaseAdmin
    .from('admin_emails')
    .select('email')
    .eq('email', user.email)
    .maybeSingle()
  return !!data
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { base64, mimeType } = await req.json()
  const v = validateImageUpload(base64, mimeType)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status })

  const filename = `edits/${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${v.ext}`

  const { error } = await supabaseAdmin.storage
    .from('event-images')
    .upload(filename, v.buffer, { contentType: v.mimeType, upsert: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: { publicUrl } } = supabaseAdmin.storage
    .from('event-images')
    .getPublicUrl(filename)

  return NextResponse.json({ url: publicUrl })
}
