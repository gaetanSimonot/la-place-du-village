import { NextRequest, NextResponse } from 'next/server'

interface AddressComponent {
  long_name: string
  short_name: string
  types: string[]
}

function extractComponent(components: AddressComponent[], ...types: string[]): string {
  return components.find(c => types.some(t => c.types.includes(t)))?.long_name ?? ''
}

export async function GET(req: NextRequest) {
  const placeId = req.nextUrl.searchParams.get('place_id')
  const q       = req.nextUrl.searchParams.get('q')

  // ── Place Details by place_id (précis, structuré) ────────────────────────
  if (placeId) {
    const url = new URL('https://maps.googleapis.com/maps/api/place/details/json')
    url.searchParams.set('place_id', placeId)
    url.searchParams.set('fields', 'name,geometry,formatted_address,address_components')
    url.searchParams.set('language', 'fr')
    url.searchParams.set('key', process.env.GOOGLE_PLACES_KEY!)

    const res  = await fetch(url.toString())
    const data = await res.json()
    const p    = data.result

    if (!p) return NextResponse.json({ lat: null, lng: null })

    const comps: AddressComponent[] = p.address_components ?? []
    const commune = extractComponent(comps, 'locality', 'postal_town') ||
                    extractComponent(comps, 'administrative_area_level_2')
    const route   = extractComponent(comps, 'route')
    const num     = extractComponent(comps, 'street_number')
    const adresse = num && route ? `${num} ${route}` : route || ''

    return NextResponse.json({
      lat:        p.geometry?.location?.lat ?? null,
      lng:        p.geometry?.location?.lng ?? null,
      nom:        p.name ?? '',
      adresse,
      commune,
      place_id:   placeId,
    })
  }

  // ── Text search (fallback si pas de place_id) ────────────────────────────
  if (!q) return NextResponse.json({ error: 'Paramètre q ou place_id requis' }, { status: 400 })

  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&key=${process.env.GOOGLE_PLACES_KEY}`
  const res  = await fetch(url)
  const data = await res.json()

  if (data.results?.[0]) {
    const place = data.results[0]
    return NextResponse.json({
      lat:      place.geometry.location.lat,
      lng:      place.geometry.location.lng,
      adresse:  place.formatted_address,
      place_id: place.place_id,
      nom:      place.name,
    })
  }

  return NextResponse.json({ lat: null, lng: null })
}
