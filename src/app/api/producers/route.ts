import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { normalizeProduitCat } from '@/lib/produit-cats'

export async function GET(req: NextRequest) {
  const url  = new URL(req.url)
  const cat  = url.searchParams.get('categorie') ?? ''
  const q    = url.searchParams.get('search')    ?? ''

  let query = supabase
    .from('producers')
    .select('*, products(*)')
    .order('is_max', { ascending: false })
    .order('created_at', { ascending: false })

  if (q) query = query.ilike('nom', `%${q}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let list = data ?? []

  // Filtre par catégorie produit (côté serveur)
  if (cat) {
    list = list.filter(p =>
      (p.products ?? []).some((pr: { categorie: string; disponible: boolean }) =>
        normalizeProduitCat(pr.categorie) === cat && pr.disponible
      )
    )
  }

  const producers = list.map(p => {
    const disponibles = (p.products ?? []).filter((pr: { disponible: boolean }) => pr.disponible)
    return {
      id: p.id,
      nom: p.nom,
      description_courte: p.description_courte ?? null,
      commune: p.commune ?? null,
      photo_url: (p.photos ?? [])[0] ?? null,
      contact_whatsapp: p.contact_whatsapp ?? null,
      contact_tel: p.contact_tel ?? null,
      site_web: p.site_web ?? null,
      produit_categories: Array.from(new Set(disponibles.map((pr: { categorie: string }) => normalizeProduitCat(pr.categorie)))),
      produits_disponibles: disponibles.map((pr: { nom: string; categorie: string; prix_indicatif: string | null; periode_dispo: string | null }) => ({
        nom: pr.nom, categorie: normalizeProduitCat(pr.categorie), prix_indicatif: pr.prix_indicatif, periode_dispo: pr.periode_dispo,
      })),
      lat: p.lat ?? null,
      lng: p.lng ?? null,
      is_max: p.is_max ?? false,
      is_featured: p.is_featured ?? false,
    }
  })

  return NextResponse.json({ producers })
}
