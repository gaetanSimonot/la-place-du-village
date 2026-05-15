import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyUser } from '@/lib/server-auth'

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
    .select('id, titre, submitted_by')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notif "ton événement est publié" à chaque submitted_by
  const published = data ?? []
  await Promise.all(
    published
      .filter(e => !!e.submitted_by)
      .map(e => notifyUser(e.submitted_by!, {
        type: 'event_published',
        actor_name: e.titre,
        target_type: 'event',
        target_id: e.id,
      })),
  )

  return NextResponse.json({ published: published.length, events: published })
}
