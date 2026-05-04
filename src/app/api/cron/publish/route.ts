import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date().toISOString()
  const { data, error } = await supabaseAdmin
    .from('evenements')
    .update({ statut: 'publie' })
    .lte('publish_at', now)
    .eq('statut', 'en_attente')
    .not('publish_at', 'is', null)
    .select('id, titre')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ published: data?.length ?? 0, events: data })
}
