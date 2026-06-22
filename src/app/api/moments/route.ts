import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getUserContextFromRequest, requireUser, notifyByAudience, notifyUsers, notifyUser } from '@/lib/server-auth'
import { can } from '@/lib/capabilities'
import type { Moment, MomentCible, MomentKind } from '@/lib/moments'

/**
 * GET /api/moments — liste les moments ACTIFS (expires_at > now), les plus
 * récents d'abord. Enrichit auteur / cible / compteurs likes+commentaires, et
 * (si Bearer) l'état vu/liked de l'utilisateur courant.
 *
 * POST /api/moments — crée un moment. Réservé habitants / pro / admin.
 */

const MOMENTS_BUCKET_PREFIX = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/storage/v1/object/public/moments/`

export async function GET(req: NextRequest) {
  const ctx = await getUserContextFromRequest(req)   // null si non connecté
  const nowISO = new Date().toISOString()

  const { data: rows, error } = await supabaseAdmin
    .from('moments')
    .select('*')
    .gt('expires_at', nowISO)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const moments = (rows ?? []) as Record<string, unknown>[]
  if (moments.length === 0) return NextResponse.json({ moments: [] })

  const ids = moments.map(m => m.id as string)
  const authorIds = Array.from(new Set(moments.map(m => m.auteur_id as string)))
  const lieuIds = Array.from(new Set(moments.map(m => m.lieu_id).filter(Boolean) as string[]))
  const etabIds = Array.from(new Set(moments.map(m => m.etablissement_id).filter(Boolean) as string[]))
  const evIds   = Array.from(new Set(moments.map(m => m.evenement_id).filter(Boolean) as string[]))

  // ── Batch enrichissement (pas de N+1) ──────────────────────────────────
  const [profsRes, lieuxRes, etabsRes, evsRes, likesRes, commsRes, vuesRes] = await Promise.all([
    supabaseAdmin.from('profiles').select('user_id, display_name, avatar_url').in('user_id', authorIds),
    lieuIds.length ? supabaseAdmin.from('lieux').select('id, nom').in('id', lieuIds) : Promise.resolve({ data: [] }),
    etabIds.length ? supabaseAdmin.from('etablissements').select('id, nom').in('id', etabIds) : Promise.resolve({ data: [] }),
    evIds.length   ? supabaseAdmin.from('evenements').select('id, titre').in('id', evIds) : Promise.resolve({ data: [] }),
    supabaseAdmin.from('moment_likes').select('moment_id, user_id').in('moment_id', ids),
    supabaseAdmin.from('moment_commentaires').select('moment_id').in('moment_id', ids),
    ctx ? supabaseAdmin.from('moment_vues').select('moment_id').eq('user_id', ctx.userId).in('moment_id', ids) : Promise.resolve({ data: [] }),
  ])

  const profMap = Object.fromEntries(((profsRes.data ?? []) as Record<string, unknown>[]).map(p => [p.user_id as string, p]))
  const lieuMap = Object.fromEntries(((lieuxRes.data ?? []) as Record<string, unknown>[]).map(l => [l.id as string, l.nom as string]))
  const etabMap = Object.fromEntries(((etabsRes.data ?? []) as Record<string, unknown>[]).map(e => [e.id as string, e.nom as string]))
  const evMap   = Object.fromEntries(((evsRes.data ?? []) as Record<string, unknown>[]).map(e => [e.id as string, e.titre as string]))

  const likeRows = (likesRes.data ?? []) as { moment_id: string; user_id: string }[]
  const likeCount: Record<string, number> = {}
  const likedByMe = new Set<string>()
  likeRows.forEach(l => {
    likeCount[l.moment_id] = (likeCount[l.moment_id] ?? 0) + 1
    if (ctx && l.user_id === ctx.userId) likedByMe.add(l.moment_id)
  })
  const commCount: Record<string, number> = {}
  ;((commsRes.data ?? []) as { moment_id: string }[]).forEach(c => { commCount[c.moment_id] = (commCount[c.moment_id] ?? 0) + 1 })
  const vuByMe = new Set(((vuesRes.data ?? []) as { moment_id: string }[]).map(v => v.moment_id))

  const out: Moment[] = moments.map(m => {
    const prof = profMap[m.auteur_id as string] as { display_name?: string; avatar_url?: string | null } | undefined
    let cible: MomentCible | null = null
    if (m.evenement_id && evMap[m.evenement_id as string])        cible = { type: 'evenement', id: m.evenement_id as string, nom: evMap[m.evenement_id as string] }
    else if (m.etablissement_id && etabMap[m.etablissement_id as string]) cible = { type: 'etablissement', id: m.etablissement_id as string, nom: etabMap[m.etablissement_id as string] }
    else if (m.lieu_id && lieuMap[m.lieu_id as string])           cible = { type: 'lieu', id: m.lieu_id as string, nom: lieuMap[m.lieu_id as string] }
    const id = m.id as string
    return {
      id,
      auteur_id: m.auteur_id as string,
      auteur_nom: (m.auteur_nom as string) || prof?.display_name || 'Un membre',
      auteur_avatar: prof?.avatar_url ?? null,
      media_kind: m.media_kind as MomentKind,
      media_url: m.media_url as string,
      poster_url: (m.poster_url as string | null) ?? null,
      duree_sec: (m.duree_sec as number | null) ?? null,
      legende: (m.legende as string | null) ?? null,
      created_at: m.created_at as string,
      cible,
      likes: likeCount[id] ?? 0,
      comments: commCount[id] ?? 0,
      vu: vuByMe.has(id),
      liked: likedByMe.has(id),
    }
  })

  return NextResponse.json({ moments: out })
}

export async function POST(req: NextRequest) {
  const ctx = await requireUser(req)
  if (ctx instanceof Response) return ctx
  if (!can(ctx, 'publish_moment')) {
    return NextResponse.json({ error: 'Réservé aux membres Habitants ou Partenaires' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const media_kind = body.media_kind as MomentKind
    const media_url = String(body.media_url ?? '')
    if (media_kind !== 'video' && media_kind !== 'photo') {
      return NextResponse.json({ error: 'media_kind invalide' }, { status: 400 })
    }
    // Anti-injection : l'URL doit pointer vers notre bucket 'moments'.
    if (!media_url.startsWith(MOMENTS_BUCKET_PREFIX)) {
      return NextResponse.json({ error: 'media_url invalide' }, { status: 400 })
    }
    let duree: number | null = null
    if (media_kind === 'video') {
      const d = Math.round(Number(body.duree_sec))
      if (!Number.isFinite(d) || d <= 0 || d > 60) {
        return NextResponse.json({ error: 'Vidéo : durée requise (1 à 60 s)' }, { status: 400 })
      }
      duree = d
    }

    // Nom auteur depuis le profil
    const { data: prof } = await supabaseAdmin
      .from('profiles').select('display_name').eq('user_id', ctx.userId).maybeSingle()

    const expires = new Date(Date.now() + 24 * 3600 * 1000).toISOString()
    const { data: moment, error } = await supabaseAdmin
      .from('moments')
      .insert({
        auteur_id:        ctx.userId,
        auteur_nom:       prof?.display_name ?? null,
        lieu_id:          body.lieu_id || null,
        evenement_id:     body.evenement_id || null,
        etablissement_id: body.etablissement_id || null,
        media_kind,
        media_url,
        poster_url:       media_kind === 'photo' ? media_url : (body.poster_url || null),
        duree_sec:        duree,
        legende:          body.legende ? String(body.legende).slice(0, 500) : null,
        expires_at:       expires,
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)

    // ── Notifications (best-effort) ────────────────────────────────────────
    // Admin → tout le monde (compte officiel). Sinon → seulement ses amis.
    // Pas de double pour un ami de l'admin : le chemin admin est exclusif.
    const actorName = prof?.display_name ?? 'Un membre'
    if (ctx.isAdmin) {
      // Réplique exacte de post_broadcast (mur admin) : broadcast à TOUT le
      // monde (admin inclus), uniquement en PRODUCTION. Sur preview/dev (DB
      // partagée) on ne notifie que l'admin → test sans spammer les users.
      const payload = { type: 'moment_nouveau', actor_name: actorName, target_type: 'moment', target_id: moment.id }
      if (process.env.VERCEL_ENV === 'production') {
        await notifyByAudience('all', payload).catch(() => {})
      } else {
        await notifyUser(ctx.userId, payload).catch(() => {})
      }
    } else {
      const { data: friends } = await supabaseAdmin
        .from('friendships')
        .select('user1_id, user2_id')
        .eq('status', 'accepted')
        .or(`user1_id.eq.${ctx.userId},user2_id.eq.${ctx.userId}`)
      const friendIds = (friends ?? []).map(f => f.user1_id === ctx.userId ? f.user2_id : f.user1_id)
      await notifyUsers(friendIds, {
        type: 'moment_nouveau', actor_name: actorName,
        target_type: 'moment', target_id: moment.id,
      }).catch(() => {})
    }

    return NextResponse.json({ success: true, id: moment.id })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur' }, { status: 500 })
  }
}
