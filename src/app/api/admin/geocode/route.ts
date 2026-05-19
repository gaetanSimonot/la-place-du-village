import { NextRequest, NextResponse } from 'next/server'

interface AddressComponent {
  long_name: string
  short_name: string
  types: string[]
}

interface PlaceDetailsResult {
  name?: string
  formatted_address?: string
  geometry?: { location?: { lat?: number; lng?: number } }
  address_components?: AddressComponent[]
  international_phone_number?: string
  formatted_phone_number?: string
  website?: string
  url?: string
  opening_hours?: { weekday_text?: string[] }
  types?: string[]
  photos?: { photo_reference: string; width: number; height: number }[]
}

function extractComponent(components: AddressComponent[], ...types: string[]): string {
  return components.find(c => types.some(t => c.types.includes(t)))?.long_name ?? ''
}

/**
 * Devine la catégorie etablissement (5 valeurs) à partir des types Google Places.
 */
function guessEtabType(googleTypes: string[]): string | null {
  const t = new Set(googleTypes.map(s => s.toLowerCase()))
  if (t.has('restaurant') || t.has('bar') || t.has('cafe') || t.has('night_club') || t.has('meal_takeaway') || t.has('meal_delivery') || t.has('bakery'))
    return 'restaurant_bar'
  if (t.has('lodging') || t.has('hotel') || t.has('campground') || t.has('rv_park') || t.has('guest_house'))
    return 'hebergement'
  if (t.has('spa') || t.has('beauty_salon') || t.has('hair_care') || t.has('doctor') || t.has('dentist') || t.has('hospital') || t.has('pharmacy') || t.has('physiotherapist') || t.has('health'))
    return 'sante_bien_etre'
  if (t.has('gym') || t.has('park') || t.has('museum') || t.has('tourist_attraction') || t.has('amusement_park') || t.has('aquarium') || t.has('zoo') || t.has('movie_theater') || t.has('art_gallery'))
    return 'activite'
  if (t.has('store') || t.has('shopping_mall') || t.has('plumber') || t.has('electrician') || t.has('locksmith') || t.has('car_repair') || t.has('laundry') || t.has('travel_agency'))
    return 'artisan_service'
  return null
}

export async function GET(req: NextRequest) {
  const placeId = req.nextUrl.searchParams.get('place_id')
  const q       = req.nextUrl.searchParams.get('q')
  // mode=basic → ne demande que les champs Basic SKU (~$0.017) au lieu du full
  // ($0.025 avec Contact + Atmosphere). Pour les events on n'a besoin que de
  // lat/lng + nom + adresse, économise ~32% sur le Details.
  const mode    = req.nextUrl.searchParams.get('mode') ?? 'full'
  const session = req.nextUrl.searchParams.get('sessiontoken')

  // ── Place Details by place_id (précis, structuré) ────────────────────────
  if (placeId) {
    const url = new URL('https://maps.googleapis.com/maps/api/place/details/json')
    url.searchParams.set('place_id', placeId)
    // Champs : full pour commerce (pré-remplit phone/website/hours), basic pour event
    const baseFields = ['name', 'geometry', 'formatted_address', 'address_components', 'types', 'photos']
    const fullFields = [...baseFields, 'international_phone_number', 'formatted_phone_number', 'website', 'url', 'opening_hours']
    url.searchParams.set('fields', (mode === 'basic' ? baseFields : fullFields).join(','))
    url.searchParams.set('language', 'fr')
    url.searchParams.set('key', process.env.GOOGLE_PLACES_KEY!)
    // Session token : si présent, le Details devient gratuit (juste l'Autocomplete payé)
    // car ils sont facturés en bundle pour la session.
    if (session) url.searchParams.set('sessiontoken', session)

    const res  = await fetch(url.toString())
    const data = await res.json()
    const p: PlaceDetailsResult | undefined = data.result

    if (!p) return NextResponse.json({ lat: null, lng: null })

    const comps: AddressComponent[] = p.address_components ?? []
    const commune = extractComponent(comps, 'locality', 'postal_town') ||
                    extractComponent(comps, 'administrative_area_level_2')
    const route   = extractComponent(comps, 'route')
    const num     = extractComponent(comps, 'street_number')
    const adresse = num && route ? `${num} ${route}` : route || p.formatted_address || ''

    const horaires = p.opening_hours?.weekday_text?.join('\n') ?? ''
    const phone    = p.formatted_phone_number ?? p.international_phone_number ?? ''
    const types    = p.types ?? []
    const typeGuess = guessEtabType(types)
    const photoRefs = (p.photos ?? []).slice(0, 6).map(ph => ph.photo_reference)

    return NextResponse.json({
      lat:      p.geometry?.location?.lat ?? null,
      lng:      p.geometry?.location?.lng ?? null,
      nom:      p.name ?? '',
      adresse,
      commune,
      place_id: placeId,
      phone,
      website:  p.website ?? '',
      horaires,
      types,
      type_guess: typeGuess,
      photo_refs: photoRefs,
      formatted_address: p.formatted_address ?? '',
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
