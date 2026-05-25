import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * GET /api/maintenance — public, retourne { enabled: boolean }.
 *
 * FAIL OPEN : toute erreur (DB down, clé absente, exception) → { enabled: false }.
 * Le mode maintenance ne peut JAMAIS s'auto-déclencher sur incident.
 *
 * Cache CDN : 30s + SWR 60s → toggle admin propagé en <90s pour les users.
 */

export const revalidate = 30

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('config')
      .select('value')
      .eq('key', 'maintenance_mode')
      .maybeSingle()

    if (error) return NextResponse.json({ enabled: false })

    return NextResponse.json(
      { enabled: data?.value === 'true' },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
        },
      },
    )
  } catch {
    return NextResponse.json({ enabled: false })
  }
}
