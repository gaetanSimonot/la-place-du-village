#!/usr/bin/env node
/**
 * Scrape Google Places dans un rayon de 30km autour de Ganges
 * Usage : npx tsx scripts/scrape-google-places.ts
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

// ── Charger .env.local ───────────────────────────────────────────────────────
function loadEnv() {
  try {
    const content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
    for (const line of content.split('\n')) {
      const m = line.match(/^([^#][^=]*)=(.*)$/)
      if (m) {
        const key = m[1].trim()
        const val = m[2].trim()
        if (!process.env[key]) process.env[key] = val
      }
    }
  } catch { /* .env.local absent — on continue avec les vars d'environnement */ }
}
loadEnv()

const API_KEY   = process.env.GOOGLE_PLACES_API_KEY ?? process.env.GOOGLE_PLACES_KEY ?? ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ?? ''

if (!API_KEY)      { console.error('❌ GOOGLE_PLACES_API_KEY manquante'); process.exit(1) }
if (!SUPABASE_URL) { console.error('❌ NEXT_PUBLIC_SUPABASE_URL manquante'); process.exit(1) }
if (!SUPABASE_KEY) { console.error('❌ SUPABASE_SERVICE_KEY manquante'); process.exit(1) }

const db = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Config ───────────────────────────────────────────────────────────────────
const CENTER   = { lat: 43.9333, lng: 3.7 }
const RADIUS   = 30_000 // mètres
const DELAY_MS = 200    // entre chaque Place Details

// ── Types ────────────────────────────────────────────────────────────────────
type EtabType = 'restaurant_bar' | 'hebergement' | 'artisan_service' | 'sante_bien_etre' | 'activite'

const CATEGORIES: { etabType: EtabType; googleTypes: string[] }[] = [
  {
    etabType: 'restaurant_bar',
    googleTypes: ['restaurant', 'bar', 'cafe', 'bakery', 'meal_takeaway', 'meal_delivery', 'night_club', 'food'],
  },
  {
    etabType: 'hebergement',
    googleTypes: ['lodging', 'campground', 'rv_park'],
  },
  {
    etabType: 'artisan_service',
    googleTypes: ['electrician', 'plumber', 'carpenter', 'painter', 'locksmith',
      'roofing_contractor', 'general_contractor', 'car_repair', 'car_wash',
      'laundry', 'moving_company', 'storage', 'hardware_store'],
  },
  {
    etabType: 'sante_bien_etre',
    googleTypes: ['doctor', 'dentist', 'physiotherapist', 'pharmacy', 'hospital',
      'health', 'spa', 'beauty_salon', 'hair_care', 'gym'],
  },
  {
    etabType: 'activite',
    googleTypes: ['tourist_attraction', 'park', 'museum', 'art_gallery', 'amusement_park',
      'golf_course', 'bowling_alley', 'sports_complex', 'stadium', 'zoo',
      'aquarium', 'movie_theater', 'library', 'place_of_worship'],
  },
]

// ── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function extractCommune(address: string): string | null {
  for (const part of address.split(',').map(s => s.trim())) {
    const m = part.match(/^\d{5}\s+(.+)$/)
    if (m) return m[1].trim()
  }
  return null
}

function parseHoraires(weekdayText: string[]): Record<string, string> | null {
  if (!weekdayText?.length) return null
  const keys = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
  const result: Record<string, string> = {}
  weekdayText.forEach((text, i) => {
    if (i >= 7) return
    const idx = text.indexOf(':')
    if (idx === -1) return
    const val = text.slice(idx + 1).trim()
    result[keys[i]] = val === 'Closed' ? 'fermé' : val
  })
  return Object.keys(result).length > 0 ? result : null
}

async function resolvePhotoUrl(photoRef: string): Promise<string | null> {
  const url = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${photoRef}&key=${API_KEY}`
  try {
    const res = await fetch(url, { redirect: 'follow' })
    if (res.ok && res.url !== url) return res.url
  } catch {}
  return null
}

// ── Google Places API ────────────────────────────────────────────────────────
interface NearbyResult {
  place_id: string
  name: string
}

async function nearbySearch(googleType: string): Promise<NearbyResult[]> {
  const results: NearbyResult[] = []
  let pageToken: string | undefined

  do {
    const params = new URLSearchParams({
      location: `${CENTER.lat},${CENTER.lng}`,
      radius:   String(RADIUS),
      type:     googleType,
      key:      API_KEY,
      language: 'fr',
    })
    if (pageToken) params.set('pagetoken', pageToken)

    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params}`
    const data = await fetch(url).then(r => r.json()) as {
      status: string
      results: NearbyResult[]
      next_page_token?: string
      error_message?: string
    }

    if (data.status === 'REQUEST_DENIED') {
      console.error(`  ❌ API error: ${data.error_message ?? data.status}`)
      break
    }
    if (data.results) results.push(...data.results)

    pageToken = data.next_page_token
    if (pageToken) await sleep(2_000) // Google exige ~2s avant next_page_token

  } while (pageToken)

  return results
}

interface PlaceDetails {
  place_id: string
  name: string
  formatted_address?: string
  geometry?: { location: { lat: number; lng: number } }
  formatted_phone_number?: string
  website?: string
  opening_hours?: { weekday_text?: string[] }
  rating?: number
  user_ratings_total?: number
  photos?: { photo_reference: string }[]
  editorial_summary?: { overview?: string }
  types?: string[]
}

async function getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  const fields = [
    'place_id', 'name', 'formatted_address', 'geometry',
    'formatted_phone_number', 'website', 'opening_hours',
    'rating', 'user_ratings_total', 'photos', 'editorial_summary', 'types',
  ].join(',')

  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${API_KEY}&language=fr`
  const data = await fetch(url).then(r => r.json()) as {
    status: string
    result?: PlaceDetails
  }

  if (data.status !== 'OK' || !data.result) return null
  return data.result
}

// ── Main ─────────────────────────────────────────────────────────────────────
interface Summary {
  etabType: EtabType
  scraped: number
  inserted: number
  errors: number
}

async function main() {
  console.log(`🗺️  Scraping Google Places — ${CENTER.lat},${CENTER.lng} rayon ${RADIUS / 1000}km\n`)

  const seen    = new Set<string>() // place_ids déjà traités dans cette session
  const summary: Summary[] = []
  let totalInserted = 0
  let totalErrors   = 0

  for (const { etabType, googleTypes } of CATEGORIES) {
    console.log(`\n── ${etabType.toUpperCase()} ────────────────────────────`)
    const cat: Summary = { etabType, scraped: 0, inserted: 0, errors: 0 }

    for (const gType of googleTypes) {
      console.log(`  🔍 Nearby Search: ${gType}`)
      let results: NearbyResult[]
      try {
        results = await nearbySearch(gType)
      } catch (e) {
        console.error(`  ⚠️  Erreur Nearby Search (${gType}): ${e}`)
        continue
      }

      // Filtrer les place_ids déjà vus dans cette session
      const fresh = results.filter(r => !seen.has(r.place_id))
      console.log(`     ${fresh.length} nouveaux (${results.length - fresh.length} skippés)`)

      for (const result of fresh) {
        seen.add(result.place_id)
        cat.scraped++

        await sleep(DELAY_MS)

        let details: PlaceDetails | null
        try {
          details = await getPlaceDetails(result.place_id)
        } catch (e) {
          console.error(`  ⚠️  Details erreur ${result.name}: ${e}`)
          cat.errors++
          continue
        }
        if (!details) { cat.errors++; continue }

        // Photo
        let photoUrl: string | null = null
        if (details.photos?.[0]?.photo_reference) {
          photoUrl = await resolvePhotoUrl(details.photos[0].photo_reference)
        }

        // Horaires
        const horaires = parseHoraires(details.opening_hours?.weekday_text ?? [])

        // Commune
        const commune = details.formatted_address ? extractCommune(details.formatted_address) : null

        // Upsert
        const record = {
          place_id_google:   details.place_id,
          type:              etabType,
          nom:               details.name,
          adresse:           details.formatted_address ?? null,
          commune,
          lat:               details.geometry?.location.lat ?? null,
          lng:               details.geometry?.location.lng ?? null,
          contact_tel:       details.formatted_phone_number ?? null,
          site_web:          details.website ?? null,
          horaires,
          note_google:       details.rating ?? null,
          photos:            photoUrl ? [photoUrl] : [],
          description_courte: details.editorial_summary?.overview ?? null,
          statut:            'imported',
          is_featured:       false,
          plan:              'basic',
        }

        const { error } = await db
          .from('etablissements')
          .upsert(record, { onConflict: 'place_id_google', ignoreDuplicates: false })

        if (error) {
          console.error(`  ❌ DB erreur ${details.name}: ${error.message}`)
          cat.errors++
        } else {
          cat.inserted++
          totalInserted++
          console.log(`  ✓ [${cat.scraped}] ${details.name}${commune ? ` · ${commune}` : ''}`)
        }
      }
    }

    summary.push(cat)
    totalErrors += cat.errors
  }

  // ── Résumé ────────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(50))
  console.log('📊 RÉSUMÉ')
  console.log('─'.repeat(50))
  for (const s of summary) {
    console.log(`  ${s.etabType.padEnd(20)} scrapé: ${String(s.scraped).padStart(3)}  inséré: ${String(s.inserted).padStart(3)}  erreurs: ${s.errors}`)
  }
  console.log('─'.repeat(50))
  console.log(`  Total inséré : ${totalInserted}`)
  console.log(`  Total erreurs: ${totalErrors}`)
  console.log('─'.repeat(50))
}

main().catch(e => { console.error(e); process.exit(1) })
