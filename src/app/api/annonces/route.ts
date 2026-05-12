import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'
import {
  isAnnonceType,
  isAnnonceCategorie,
  validateAnnonceInput,
  type AnnonceCreateInput,
} from '@/lib/annonces'

/**
 * GET — liste publique des annonces visibles.
 *
 * Filtres : ?type=, ?categorie=, ?ville=
 * Tri    : ?tri=date_desc | prix_asc | prix_desc  (défaut : date_desc)
 * Pagination : ?limit (défaut 50, max 100), ?offset
 *
 * Les sponsorisées (sponsored = true ET sponsored_until > now) sont toujours en tête.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type      = searchParams.get('type')
  const categorie = searchParams.get('categorie')
  const ville     = searchParams.get('ville')
  const tri       = searchParams.get('tri') ?? 'date_desc'
  const limit     = Math.min(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 100)
  const offset    = Math.max(parseInt(searchParams.get('offset') ?? '0', 10) || 0, 0)

  let query = supabaseAdmin
    .from('annonces')
    .select('*')
    .in('statut', ['active', 'don_final'])

  if (type && isAnnonceType(type))                query = query.eq('type', type)
  if (categorie && isAnnonceCategorie(categorie)) query = query.eq('categorie', categorie)
  if (ville)                                      query = query.ilike('ville', `%${ville}%`)

  // Sponsorisées d'abord, puis tri demandé
  query = query.order('sponsored', { ascending: false })

  switch (tri) {
    case 'prix_asc':  query = query.order('prix_actuel', { ascending: true, nullsFirst: false }); break
    case 'prix_desc': query = query.order('prix_actuel', { ascending: false, nullsFirst: false }); break
    default:          query = query.order('created_at', { ascending: false })
  }

  query = query.range(offset, offset + limit - 1)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ annonces: data ?? [] })
}

/**
 * POST — création d'une annonce.
 *
 * Body : AnnonceCreateInput (voir src/lib/annonces.ts)
 * Le type doit être autorisé par le plan du user (cf canCreateType).
 * expires_at est posé automatiquement par le trigger SQL selon le plan.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const body = (await req.json()) as AnnonceCreateInput

  const err = validateAnnonceInput(body, ctx.plan)
  if (err) return NextResponse.json({ error: err }, { status: 400 })

  const insert = {
    user_id:             ctx.userId,
    type:                body.type,
    titre:               body.titre.trim(),
    description:         body.description?.trim() || null,
    categorie:           body.categorie,
    photos:              Array.isArray(body.photos) ? body.photos : [],
    prix_initial:        body.prix_initial ?? null,
    prix_seuil:          body.prix_seuil ?? null,
    taux_baisse_pct:     body.taux_baisse_pct ?? null,
    contact_tel:         body.contact_tel?.trim() || null,
    contact_email:       body.contact_email?.trim() || null,
    ville:               body.ville?.trim() || null,
    lat:                 body.lat ?? null,
    lng:                 body.lng ?? null,
    remise_main_propre:  !!body.remise_main_propre,
    garantie_jours:      Math.max(0, body.garantie_jours ?? 0),
  }

  const { data, error } = await supabaseAdmin
    .from('annonces')
    .insert(insert)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ annonce: data })
}
