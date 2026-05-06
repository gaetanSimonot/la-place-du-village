import { NextRequest, NextResponse } from 'next/server'

const CAT_QUERIES: Record<string, string> = {
  fruits_legumes: 'fresh vegetables fruits market',
  viandes: 'fresh meat butcher local',
  fromages_laitages: 'cheese dairy farm fresh',
  oeufs: 'eggs farm fresh organic',
  pain: 'artisan bread bakery sourdough',
  miel: 'honey jar natural organic',
  panier: 'vegetable basket local farm',
  plantes: 'herbs plants flowers garden',
  huiles: 'olive oil bottle condiments',
  boissons: 'wine bottles local beverages',
  artisanat: 'handmade pottery craft artisan',
  autre: 'local farm market produce',
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const nom = url.searchParams.get('nom') ?? ''
  const cat = url.searchParams.get('cat') ?? ''
  const key = process.env.PEXELS_API_KEY
  if (!key) return NextResponse.json({ url: null })

  const query = nom || CAT_QUERIES[cat] || 'local farm market'
  const page = Math.ceil(Math.random() * 3)

  try {
    const r = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=8&page=${page}&orientation=square`,
      { headers: { Authorization: key } }
    )
    if (!r.ok) return NextResponse.json({ url: null })
    const d = await r.json()
    const photos: { src: { medium: string } }[] = d.photos ?? []
    if (!photos.length) return NextResponse.json({ url: null })
    const photo = photos[Math.floor(Math.random() * photos.length)]
    return NextResponse.json({ url: photo.src.medium })
  } catch {
    return NextResponse.json({ url: null })
  }
}
