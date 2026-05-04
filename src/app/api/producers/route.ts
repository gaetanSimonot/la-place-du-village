import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

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
        pr.categorie === cat && pr.disponible
      )
    )
  }

  const producers = list.map(p => ({
    id: p.id,
    nom: p.nom,
    description_courte: p.description_courte ?? null,
    commune: p.commune ?? null,
    photo_url: (p.photos ?? [])[0] ?? null,
    contact_whatsapp: p.contact_whatsapp ?? null,
    contact_tel: p.contact_tel ?? null,
    produit_categories: Array.from(
      new Set(
        (p.products ?? [])
          .filter((pr: { disponible: boolean }) => pr.disponible)
          .map((pr: { categorie: string }) => pr.categorie)
      )
    ),
    produits_disponibles: (p.products ?? [])
      .filter((pr: { disponible: boolean }) => pr.disponible)
      .map((pr: { nom: string; categorie: string; prix_indicatif: string | null; periode_dispo: string | null; dispo_jusqu_au: string | null }) => ({
        nom: pr.nom, categorie: pr.categorie, prix_indicatif: pr.prix_indicatif,
        periode_dispo: pr.periode_dispo, dispo_jusqu_au: pr.dispo_jusqu_au,
      })),
    lat: p.lat ?? null,
    lng: p.lng ?? null,
    is_max: p.is_max ?? false,
    site_web: p.site_web ?? null,
  }))

  return NextResponse.json({ producers })
}
