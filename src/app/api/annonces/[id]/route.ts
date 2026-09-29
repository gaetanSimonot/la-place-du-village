import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser, getUserContextFromRequest } from '@/lib/server-auth'
import { can } from '@/lib/capabilities'
import { EARLY_BID_DELAY_HOURS, getDureeAnnonceJours } from '@/lib/annonces'
import type { Plan } from '@/lib/capabilities'

const EDITABLE_FIELDS = [
  'titre',
  'description',
  'categorie',
  'photos',
  'prix_initial',
  'prix_seuil',
  'taux_baisse_pct',
  'contact_tel',
  'contact_email',
  'ville',
  'lat',
  'lng',
  'remise_main_propre',
] as const

/**
 * GET — détail public d'une annonce (visible si active ou don_final).
 * Le posteur voit aussi ses annonces vendues/expirées.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const { data, error } = await supabaseAdmin
    .from('annonces')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data)  return NextResponse.json({ error: 'Annonce introuvable' }, { status: 404 })

  // Si annonce non visible publiquement, vérifie que c'est le posteur
  if (data.statut !== 'active' && data.statut !== 'don_final') {
    const ctx = await requireUser(req)
    if (ctx instanceof Response) return ctx
    if (ctx.userId !== data.user_id && !ctx.isAdmin) {
      return NextResponse.json({ error: 'Annonce introuvable' }, { status: 404 })
    }
  }

  // Délai 12h sur les enchères inversées pour les users sans early_bid_access.
  // Le posteur lui-même voit toujours son annonce.
  if (data.type === 'enchere_inversee' && data.statut === 'active') {
    const ctx = await getUserContextFromRequest(req)
    const isOwner = ctx?.userId === data.user_id
    const hasEarlyAccess = ctx ? can(ctx, 'early_bid_access') : false

    if (!isOwner && !hasEarlyAccess) {
      const ageMs = Date.now() - new Date(data.created_at).getTime()
      if (ageMs < EARLY_BID_DELAY_HOURS * 60 * 60 * 1000) {
        return NextResponse.json({ error: 'Annonce introuvable' }, { status: 404 })
      }
    }
  }

  return NextResponse.json({ annonce: data })
}

/**
 * PATCH — édition d'une annonce (owner ou admin).
 * Le type ne peut pas être modifié après création.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { data: existing } = await supabaseAdmin
    .from('annonces')
    .select('user_id, statut, type, prix_initial')
    .eq('id', id)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Annonce introuvable' }, { status: 404 })
  if (existing.user_id !== ctx.userId && !ctx.isAdmin) {
    return NextResponse.json({ error: 'Interdit' }, { status: 403 })
  }
  // Le propriétaire peut éditer son annonce quel que soit le statut (active,
  // don_final, expiree) SAUF une fois vendue. Le statut n'est pas éditable
  // (allowlist EDITABLE_FIELDS), donc aucun risque de "dé-vendre".
  if (existing.statut === 'vendu' && !ctx.isAdmin) {
    return NextResponse.json({ error: 'Annonce vendue, non modifiable' }, { status: 409 })
  }

  const body = await req.json()
  const patch: Record<string, unknown> = {}
  // L'admin peut aussi changer le TYPE (modération/reclassement). Le
  // propriétaire normal ne le peut pas (anti-abus sur les enchères).
  const fields = ctx.isAdmin ? [...EDITABLE_FIELDS, 'type'] : EDITABLE_FIELDS
  for (const k of fields) {
    if (k in body) patch[k] = body[k] === '' ? null : body[k]
  }

  // Réactivation admin : si on repasse un don_final vers un type vendable
  // (vente/troc/service/enchère), on le remet en 'active' avec un vrai prix
  // courant — sinon l'annonce resterait affichée "Gratuit".
  if (
    ctx.isAdmin &&
    typeof patch.type === 'string' &&
    patch.type !== 'don' &&
    existing.statut === 'don_final'
  ) {
    patch.statut = 'active'
    const newPrix = patch.prix_initial ?? body.prix_initial
    if (newPrix != null && newPrix !== '') patch.prix_actuel = Number(newPrix)
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Aucun champ à modifier' }, { status: 400 })
  }

  /*
   * METTRE À JOUR UNE ENCHÈRE INVERSÉE LA RELANCE, à partir d'aujourd'hui.
   *
   * La baisse nocturne (annonces_cron_baisse_encheres, en base) n'a pas de
   * date de départ : chaque nuit, elle applique le pourcentage au PRIX ACTUEL.
   * Relancer, c'est donc remettre le prix actuel au prix de départ (celui
   * qu'on vient de saisir, sinon l'ancien) — le pourcentage et le plancher
   * sont ceux du formulaire —, remettre en ligne une annonce expirée, et lui
   * redonner une durée de vie complète depuis aujourd'hui (même règle que la
   * création : 21 ou 30 jours selon le plan du propriétaire). La baisse
   * repart la nuit suivante.
   */
  const typeFinal = (patch.type as string | undefined) ?? existing.type
  if (typeFinal === 'enchere_inversee') {
    const depart = patch.prix_initial ?? existing.prix_initial
    if (depart != null && depart !== '') patch.prix_actuel = Number(depart)
    if (existing.statut === 'expiree' || existing.statut === 'active') patch.statut = 'active'
    const { data: proprio } = await supabaseAdmin
      .from('profiles').select('plan').eq('user_id', existing.user_id).maybeSingle()
    const jours = getDureeAnnonceJours(((proprio?.plan as Plan | undefined) ?? 'basic'))
    patch.expires_at = new Date(Date.now() + jours * 86_400_000).toISOString()
  }

  const { data, error } = await supabaseAdmin
    .from('annonces')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ annonce: data })
}

/**
 * DELETE — suppression définitive (owner ou admin).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { data: existing } = await supabaseAdmin
    .from('annonces')
    .select('user_id')
    .eq('id', id)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Annonce introuvable' }, { status: 404 })
  if (existing.user_id !== ctx.userId && !ctx.isAdmin) {
    return NextResponse.json({ error: 'Interdit' }, { status: 403 })
  }

  const { error } = await supabaseAdmin.from('annonces').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
