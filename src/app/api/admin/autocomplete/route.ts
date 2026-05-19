import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// Biaisé sur Ganges (Hérault) — rayon 40km
const LOCATION = '43.9333,3.7005'
const RADIUS = '40000'

// Force dynamic — empêche Next.js de cacher les réponses autocomplete
export const dynamic = 'force-dynamic'

interface DbMatch {
  kind: 'etablissement' | 'producteur' | 'lieu'
  id: string
  nom: string
  commune: string | null
  adresse?: string | null
  type?: string | null
  claimed: boolean
  // Pour les lieux : lat/lng directement utilisables sans nouvel appel
  lat?: number | null
  lng?: number | null
}

// Cherche dans Supabase. Selon le mode:
// - 'commerce' (défaut): etablissements + producteurs
// - 'lieux' (pour event LieuSearch): lieux + etablissements (qui peuvent servir
//   de lieu récurrent comme 'Bergerie du Col', 'Salle des fêtes de Ganges')
async function searchDb(q: string, mode: 'commerce' | 'lieux'): Promise<DbMatch[]> {
  const like = `%${q}%`
  if (mode === 'lieux') {
    const [{ data: lieux }, { data: etabs }] = await Promise.all([
      supabaseAdmin
        .from('lieux')
        .select('id, nom, commune, adresse, lat, lng')
        .or(`nom.ilike.${like},commune.ilike.${like}`)
        .limit(5),
      supabaseAdmin
        .from('etablissements')
        .select('id, nom, commune, adresse, type, lat, lng, user_id')
        .or(`nom.ilike.${like},commune.ilike.${like}`)
        .limit(3),
    ])
    const results: DbMatch[] = []
    for (const l of (lieux ?? [])) {
      results.push({ kind: 'lieu', id: l.id, nom: l.nom, commune: l.commune, adresse: l.adresse, lat: l.lat, lng: l.lng, claimed: false })
    }
    for (const e of (etabs ?? [])) {
      results.push({ kind: 'etablissement', id: e.id, nom: e.nom, commune: e.commune, adresse: e.adresse, type: e.type, lat: e.lat, lng: e.lng, claimed: !!e.user_id })
    }
    return results.slice(0, 6)
  }
  // commerce mode
  const [{ data: etabs }, { data: prods }] = await Promise.all([
    supabaseAdmin
      .from('etablissements')
      .select('id, nom, commune, adresse, type, user_id')
      .or(`nom.ilike.${like},commune.ilike.${like}`)
      .limit(5),
    supabaseAdmin
      .from('producers')
      .select('id, nom, commune, adresse, user_id')
      .or(`nom.ilike.${like},commune.ilike.${like}`)
      .limit(5),
  ])
  const results: DbMatch[] = []
  for (const e of (etabs ?? [])) {
    results.push({ kind: 'etablissement', id: e.id, nom: e.nom, commune: e.commune, adresse: e.adresse, type: e.type, claimed: !!e.user_id })
  }
  for (const p of (prods ?? [])) {
    results.push({ kind: 'producteur', id: p.id, nom: p.nom, commune: p.commune, adresse: p.adresse, claimed: !!p.user_id })
  }
  return results.slice(0, 6)
}

export async function GET(req: NextRequest) {
  const input = req.nextUrl.searchParams.get('q')
  // sessiontoken: UUID généré côté client par session de recherche.
  // Avec ce token, Google groupe les frappes en 1 session → autocomplete
  // devient gratuit, seul le Place Details au select est facturé.
  const session = req.nextUrl.searchParams.get('sessiontoken')
  // dbonly=1 → skip Google complètement (économie max si on sait que le user
  // veut juste chercher dans la DB locale). Par défaut: les 2 en parallèle.
  const dbOnly = req.nextUrl.searchParams.get('dbonly') === '1'
  // kind=lieux → mode event LieuSearch (cherche dans lieux + etablissements)
  // sinon → mode commerce (etablissements + producteurs)
  const kind = req.nextUrl.searchParams.get('kind') === 'lieux' ? 'lieux' : 'commerce'
  // types=address → restreint l'autocomplete Google aux adresses uniquement
  // (pas de commerces/lieux). Plus simple, juste pour fixer lat/lng.
  const types = req.nextUrl.searchParams.get('types')
  if (!input || input.length < 2) return NextResponse.json({ predictions: [], db: [] })

  // Lance DB search + Google en parallèle pour latence min
  // - dbOnly: skip Google
  // - types=address: skip DB (use case purement adresse pour fixer lat/lng)
  // - défaut: les 2 en parallèle
  const dbPromise = types ? Promise.resolve([]) : searchDb(input, kind)
  const googlePromise = dbOnly ? Promise.resolve(null) : (async () => {
    const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json')
    url.searchParams.set('input', input)
    url.searchParams.set('location', LOCATION)
    url.searchParams.set('radius', RADIUS)
    url.searchParams.set('language', 'fr')
    url.searchParams.set('components', 'country:fr')
    if (types) url.searchParams.set('types', types)
    url.searchParams.set('key', process.env.GOOGLE_PLACES_KEY!)
    if (session) url.searchParams.set('sessiontoken', session)
    const res = await fetch(url.toString())
    return res.json()
  })()

  const [db, data] = await Promise.all([dbPromise, googlePromise])

  const predictions = !data ? [] : (data.predictions ?? []).map((p: {
    place_id: string
    description: string
    structured_formatting: { main_text: string; secondary_text: string }
  }) => ({
    place_id: p.place_id,
    description: p.description,
    main: p.structured_formatting?.main_text,
    secondary: p.structured_formatting?.secondary_text,
  }))

  return NextResponse.json({ predictions, db })
}
