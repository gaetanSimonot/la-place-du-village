import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireUser } from '@/lib/server-auth'
import { chargerIdentitesEtab } from '@/lib/identite'

/**
 * GET — toutes les conversations du user (acheteur ou vendeur), enrichies
 * avec annonce, autre membre, dernier message et compteur unread.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx

  const { data: convs, error } = await supabaseAdmin
    .from('annonces_conversations')
    .select('*')
    .or(`acheteur_id.eq.${ctx.userId},vendeur_id.eq.${ctx.userId}`)
    .order('updated_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!convs?.length) return NextResponse.json({ conversations: [] })

  // Charge annonces + profils autres
  const annonceIds = Array.from(new Set(convs.map(c => c.annonce_id)))
  const otherIds   = Array.from(new Set(convs.map(c =>
    c.acheteur_id === ctx.userId ? c.vendeur_id : c.acheteur_id,
  )))

  const [{ data: annonces }, { data: profiles }] = await Promise.all([
    supabaseAdmin.from('annonces').select('id, titre, photos, statut, etablissement_id').in('id', annonceIds),
    supabaseAdmin.from('profiles').select('user_id, display_name, avatar_url').in('user_id', otherIds),
  ])

  const annonceMap = Object.fromEntries((annonces ?? []).map(a => [a.id, a]))
  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.user_id, p]))

  // Blase : dans la boîte de réception d'un acheteur, le vendeur s'affiche
  // sous la fiche qui porte l'annonce.
  const identites = await chargerIdentitesEtab(
    supabaseAdmin,
    (annonces ?? []).map(a => (a as { etablissement_id?: string | null }).etablissement_id),
  )

  // Dernier message + count unread par conv
  const convIds = convs.map(c => c.id)
  const { data: msgs } = await supabaseAdmin
    .from('annonces_messages')
    .select('*')
    .in('conversation_id', convIds)
    .order('created_at', { ascending: false })

  const lastByConv: Record<string, { id: string; conversation_id: string; sender_id: string | null; kind: string; content: string; lu_at: string | null; created_at: string }> = {}
  const unreadByConv: Record<string, number> = {}
  for (const m of msgs ?? []) {
    if (!lastByConv[m.conversation_id]) lastByConv[m.conversation_id] = m
    if (m.sender_id && m.sender_id !== ctx.userId && !m.lu_at) {
      unreadByConv[m.conversation_id] = (unreadByConv[m.conversation_id] ?? 0) + 1
    }
  }

  const enriched = convs.map(c => {
    const otherId = c.acheteur_id === ctx.userId ? c.vendeur_id : c.acheteur_id
    const annonce = annonceMap[c.annonce_id] ?? null
    const blaseId = (annonce as { etablissement_id?: string | null } | null)?.etablissement_id
    const etab    = blaseId && otherId === c.vendeur_id ? identites.get(blaseId) : undefined

    return {
      ...c,
      role:         c.vendeur_id === ctx.userId ? 'vendeur' : 'acheteur',
      annonce,
      other:        etab
        ? { user_id: otherId, display_name: etab.nom, avatar_url: etab.photos?.[0] ?? null }
        : (profileMap[otherId] ?? null),
      last_message: lastByConv[c.id] ?? null,
      unread_count: unreadByConv[c.id] ?? 0,
    }
  })

  return NextResponse.json({ conversations: enriched })
}
