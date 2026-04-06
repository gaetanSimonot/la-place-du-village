import { NextRequest, NextResponse } from 'next/server'

// Biaisé sur Ganges (Hérault) — rayon 40km
const LOCATION = '43.9333,3.7005'
const RADIUS = '40000'

export async function GET(req: NextRequest) {
  const input = req.nextUrl.searchParams.get('q')
  if (!input || input.length < 2) return NextResponse.json({ predictions: [] })

  const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json')
  url.searchParams.set('input', input)
  url.searchParams.set('location', LOCATION)
  url.searchParams.set('radius', RADIUS)
  url.searchParams.set('language', 'fr')
  url.searchParams.set('components', 'country:fr')
  url.searchParams.set('key', process.env.GOOGLE_PLACES_KEY!)

  const res = await fetch(url.toString())
  const data = await res.json()

  const predictions = (data.predictions ?? []).map((p: {
    place_id: string
    description: string
    structured_formatting: { main_text: string; secondary_text: string }
  }) => ({
    place_id: p.place_id,
    description: p.description,
    main: p.structured_formatting?.main_text,
    secondary: p.structured_formatting?.secondary_text,
  }))

  return NextResponse.json({ predictions })
}
