import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser, getUserContextFromRequest } from '@/lib/server-auth'
import {
  isAnnonceType,
  isAnnonceCategorie,
  validateAnnonceInput,
  getQuotaAnnoncesMois,
  EARLY_BID_DELAY_HOURS,
  type AnnonceCreateInput,
} from '@/lib/annonces'
import { can } from '@/lib/capabilities'
import { canSubmitArticleJournal } from '@/lib/articles'

/**
 * GET — liste publique des annonces visibles.
 *
 * Filtres : ?type=, ?categorie=, ?ville=
 * Tri    : ?tri=date_desc | prix_asc | prix_desc  (défaut : date_desc)
 * Pagination : ?limit (défaut 50, max 100), ?offset
 *
 * Les sponsorisées (sponsored = true ET sponsored_until > now) sont toujours en tête.
 *
 * Accès anticipé enchères : les users sans `early_bid_access` (= basic et anonymes)
 * ne voient pas les enchères inversées créées dans les EARLY_BID_DELAY_HOURS dernières heures.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type      = searchParams.get('type')
  const categorie = searchParams.get('categorie')
  const ville     = searchParams.get('ville')
  const tri       = searchParams.get('tri') ?? 'date_desc'
  const limit     = Math.min(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 100)
  const offset    = Math.max(parseInt(searchParams.get('offset') ?? '0', 10) || 0, 0)

  // Détermine si le user voit les nouvelles enchères immédiatement
  const ctx = await getUserContextFromRequest(req)
  const hasEarlyAccess = ctx ? can(ctx, 'early_bid_access') : false

  let query = supabaseAdmin
    .from('annonces')
    .select('*')
    .in('statut', ['active', 'don_final'])

  if (type && isAnnonceType(type))                query = query.eq('type', type)
  if (categorie && isAnnonceCategorie(categorie)) query = query.eq('categorie', categorie)
  if (ville)                                      query = query.ilike('ville', `%${ville}%`)

  // Délai 12h sur les enchères inversées pour les non-Habitants
  if (!hasEarlyAccess) {
    const cutoff = new Date(Date.now() - EARLY_BID_DELAY_HOURS * 60 * 60 * 1000).toISOString()
    query = query.or(`type.neq.enchere_inversee,created_at.lte.${cutoff}`)
  }

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
 * Quota mensuel calendaire :
 *  - basic : 3 / mois calendaire pour les types non-don (vente/troc/enchère).
 *            Les dons sont illimités (pour favoriser le partage gratuit).
 *  - habitants / pro / admin : illimité tous types
 */
export async function POST(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const body = (await req.json()) as AnnonceCreateInput

  const err = validateAnnonceInput(body, ctx.plan)
  if (err) return NextResponse.json({ error: err }, { status: 400 })

  // Quota mensuel — uniquement sur les types non-don.
  // Les dons sont toujours illimités pour favoriser le partage gratuit.
  const quota = getQuotaAnnoncesMois(ctx.plan)
  if (!ctx.isAdmin && Number.isFinite(quota) && body.type !== 'don') {
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const { count } = await supabaseAdmin
      .from('annonces')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', ctx.userId)
      .neq('type', 'don')
      .gte('created_at', startOfMonth.toISOString())

    if ((count ?? 0) >= quota) {
      return NextResponse.json({
        error: `Tu as atteint ta limite de ${quota} annonces non-don ce mois-ci. Les dons restent illimités. Passe Habitants pour publier tous types sans limite.`,
        upgradeRequired: true,
      }, { status: 429 })
    }
  }

  // Flag "publier dans le journal" : réservé Habitants/Pro.
  // Si user basic envoie true, on ignore silencieusement (degrade gracefully).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wantJournal = !!(body as any).publier_dans_journal
  const publierDansJournal = wantJournal && canSubmitArticleJournal(ctx.plan)

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
    publier_dans_journal: publierDansJournal,
  }

  const { data, error } = await supabaseAdmin
    .from('annonces')
    .insert(insert)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ annonce: data })
}
