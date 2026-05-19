import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'
import {
  canSubmitArticleJournal,
  validateArticleInput,
  type ArticleCreateInput,
} from '@/lib/articles'

/**
 * POST /api/articles
 * Soumet un article pour le journal. Réservé Habitants/Pro.
 * Crée en statut 'en_attente' → modération admin obligatoire avant publication.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  if (!canSubmitArticleJournal(ctx.plan)) {
    return NextResponse.json({
      error: 'Les articles du journal sont réservés aux abonnés Habitants et Pro.',
      upgradeRequired: true,
    }, { status: 403 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = (await req.json()) as ArticleCreateInput & { statut?: 'brouillon' | 'en_attente' }
  // Pour brouillon : on autorise titre+corps moins stricts (l'user sauvegarde
  // en cours de rédaction). Pour en_attente, on valide complètement.
  const wantStatut = body.statut === 'brouillon' ? 'brouillon' : 'en_attente'
  if (wantStatut === 'en_attente') {
    const err = validateArticleInput(body)
    if (err) return NextResponse.json({ error: err }, { status: 400 })
  } else {
    if (!body.titre?.trim()) return NextResponse.json({ error: 'Le titre est requis' }, { status: 400 })
  }

  const insert = {
    user_id: ctx.userId,
    titre: body.titre.trim(),
    corps: (body.corps ?? '').trim(),
    photo_url: body.photo_url?.trim() || null,
    statut: wantStatut,
  }

  const { data, error } = await supabaseAdmin
    .from('articles_journal')
    .insert(insert)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ article: data })
}

/**
 * GET /api/articles
 * Liste les articles publiés (lecture publique).
 */
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('articles_journal')
    .select('id, titre, corps, photo_url, journal_id, created_at')
    .eq('statut', 'publie')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ articles: data ?? [] })
}
