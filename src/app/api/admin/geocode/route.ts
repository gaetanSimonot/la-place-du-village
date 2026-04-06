import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')
  if (!q) return NextResponse.json({ error: 'Paramètre q requis' }, { status: 400 })

  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&key=${process.env.GOOGLE_PLACES_KEY}`
  const res = await fetch(url)
  const data = await res.json()

  if (data.results?.[0]) {
    const place = data.results[0]
    return NextResponse.json({
      lat: place.geometry.location.lat,
      lng: place.geometry.location.lng,
      adresse: place.formatted_address,
      place_id: place.place_id,
      nom: place.name,
    })
  }

  return NextResponse.json({ lat: null, lng: null })
}
