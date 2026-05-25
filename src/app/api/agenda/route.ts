import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getDateRange } from '@/lib/filters'
import type { FiltreQuand } from '@/lib/types'

/**
 * GET /api/agenda — payload unique pour la liste des événements.
 *
 * Avant : page.tsx en mode agenda lançait 3-5 requêtes Supabase parallèles
 * (events filtrés, promo events, splash featured, config masquer_passes).
 * Après : 1 fetch HTTP qui retourne tout en 1 round-trip.
 *
 * Query params :
 *   ?cat=concert,marche,atelier   (CSV catégories — vide = toutes)
 *   ?quand=cette_semaine          (FiltreQuand — défaut: toujours)
 *   ?masquerPasses=1              (0/1 — défaut: 0)
 *
 * Cache : variant par URL (chaque combinaison filtres = sa propre entrée
 * CDN). 60s s-maxage + 120s SWR.
 *
 * PUBLIC : pas de requireUser. Les filtres viennent du client mais ne
 * révèlent rien de personnel.
 */

export const revalidate = 60

const SELECT = 'id, titre, categorie, date_debut, date_fin, heure, image_url, image_position, promotion, promo_ordre, lieux(id, nom, commune, lat, lng, place_id_google)'

const QUAND_VALUES: FiltreQuand[] = ['toujours', 'aujourd_hui', 'cette_semaine', 'ce_week_end', 'ce_mois']

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const catCsv = (searchParams.get('cat') ?? '').trim()
  const quandRaw = (searchParams.get('quand') ?? 'toujours').trim()
  const masquerPasses = searchParams.get('masquerPasses') === '1'

  const cats = catCsv ? catCsv.split(',').map(s => s.trim()).filter(Boolean) : []
  const quand: FiltreQuand = QUAND_VALUES.includes(quandRaw as FiltreQuand) ? (quandRaw as FiltreQuand) : 'toujours'
  const nowISO = new Date().toISOString()

  // ── PARALLÈLE : events filtrés + promo events + splash featured + config ──

  // Build query principale
  let q = supabaseAdmin.from('evenements').select(SELECT)
    .eq('statut', 'publie')
    .order('date_debut', { ascending: true })
    .limit(300)
  if (cats.length > 0) q = q.in('categorie', cats)
  const range = getDateRange(quand)
  if (range) q = q.gte('date_debut', range.from).lte('date_debut', range.to)
  if (masquerPasses) {
    // Force Europe/Paris (Vercel = UTC par défaut, peu importe la région).
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Paris',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date())
    q = q.or(`date_fin.gte.${today},and(date_fin.is.null,date_debut.gte.${today})`)
  }

  // Promo events (pro/max), avec même filtre masquerPasses mais SANS cat / quand
  // (la promotion est globale, peu importe ce que l'user filtre)
  let pq = supabaseAdmin.from('evenements').select(SELECT)
    .eq('statut', 'publie')
    .in('promotion', ['pro', 'max'])
    .order('date_debut', { ascending: true })
  if (masquerPasses) {
    // Force Europe/Paris (Vercel = UTC par défaut, peu importe la région).
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Paris',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date())
    pq = pq.or(`date_fin.gte.${today},and(date_fin.is.null,date_debut.gte.${today})`)
  }

  const [evRes, promoRes, splashSlotsRes] = await Promise.all([
    q,
    pq,
    supabaseAdmin
      .from('featured_slots')
      .select('content_id, priority')
      .eq('slot', 'splash')
      .eq('content_type', 'evenement')
      .lte('starts_at', nowISO)
      .gt('ends_at', nowISO)
      .order('priority', { ascending: false }),
  ])

  // Splash featured events (séparé car dépend de slots → events)
  const splashIds = (splashSlotsRes.data ?? []).map(s => s.content_id as string)
  let splashFeatured: Array<Record<string, unknown>> = []
  if (splashIds.length > 0) {
    const { data: events } = await supabaseAdmin
      .from('evenements')
      .select('id, titre, categorie, date_debut, date_fin, heure, image_url, image_position, promotion, promo_ordre, vote_count, submitted_by_name, lieux(id, nom, commune, lat, lng, place_id_google)')
      .in('id', splashIds)
      .eq('statut', 'publie')
    const eventMap = Object.fromEntries(((events ?? []) as Array<Record<string, unknown>>).map(e => [e.id as string, e]))
    splashFeatured = splashIds.map(id => eventMap[id]).filter(Boolean) as Array<Record<string, unknown>>
  }

  return NextResponse.json({
    evenements:    evRes.data ?? [],
    promoEvents:   promoRes.data ?? [],
    splashFeatured,
  }, {
    headers: {
      // Cache CDN 60s par variation URL (cat+quand+masquerPasses)
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
    },
  })
}
