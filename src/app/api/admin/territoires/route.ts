import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAdmin } from '@/lib/server-auth'
import { oublierTerritoires } from '@/lib/territoires'

/**
 * LES TERRITOIRES ET LEURS GROUPES — l'écran d'aiguillage.
 *
 * Ouvrir un territoire, c'est y brancher des groupes. Jusqu'ici la table
 * `territoire_groupes` ne se remplissait qu'en SQL : brancher une page
 * Facebook paloise demandait une migration. Cette route la rend éditable.
 *
 * Elle montre surtout LES GROUPES QUI ARRIVENT — ceux vus dans les messages
 * reçus — et lesquels ne sont pas encore rangés. C'est la seule liste fiable :
 * les noms de groupes viennent des collecteurs, personne ne les tape ici, et
 * une faute de frappe dans un nom déclaré ne se verrait jamais autrement.
 *
 * Un groupe non déclaré n'est pas une panne : il retombe sur le territoire par
 * défaut, et la géographie corrige le rangement ensuite (cf. territoireDuPoint).
 * Le déclarer sert à orienter le géocodage, qui lui se décide AVANT de savoir
 * où se tient l'événement.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

/** Les groupes visibles dans l'historique récent. Assez pour couvrir les
 *  collecteurs actifs sans ramener toute la table. */
const FENETRE_MESSAGES = 3000

interface Vu { source: string; groupe: string; messages: number; dernier: string }

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const [terrRes, centresRes, groupesRes, msgRes] = await Promise.all([
    supabaseAdmin.from('territoires')
      .select('id, slug, nom, rayon_affichage_km, rayon_insertion_km, indice_geo, par_defaut, actif')
      .order('par_defaut', { ascending: false }).order('nom'),
    supabaseAdmin.from('zone_centres').select('id, nom, lat, lng, territoire_id').order('created_at'),
    supabaseAdmin.from('territoire_groupes').select('id, source, groupe, territoire_id').order('groupe'),
    supabaseAdmin.from('messages_entrants').select('source, groupe, created_at')
      .order('created_at', { ascending: false }).limit(FENETRE_MESSAGES),
  ])

  // Le regroupement se fait ici : PostgREST ne sait pas faire de `group by`,
  // et la fenêtre est assez petite pour que ça ne se sente pas.
  const parGroupe = new Map<string, Vu>()
  for (const m of (msgRes.data ?? []) as { source: string | null; groupe: string | null; created_at: string }[]) {
    if (!m.groupe) continue
    const source = m.source ?? 'inconnu'
    const cle = `${source} :: ${m.groupe}`
    const v = parGroupe.get(cle)
    if (v) v.messages++
    else parGroupe.set(cle, { source, groupe: m.groupe, messages: 1, dernier: m.created_at })
  }

  return NextResponse.json({
    territoires: (terrRes.data ?? []).map(t => ({
      ...t,
      centres: (centresRes.data ?? []).filter(c => c.territoire_id === t.id),
      groupes: (groupesRes.data ?? []).filter(g => g.territoire_id === t.id),
    })),
    // Les centres qu'aucun territoire ne réclame : ils ne servent à rien, et
    // l'admin doit pouvoir s'en apercevoir.
    centresOrphelins: (centresRes.data ?? []).filter(c => !c.territoire_id),
    vus: Array.from(parGroupe.values()).sort((a, b) => b.messages - a.messages),
  })
}

/** Déclare (ou déplace) un groupe. Un groupe n'appartient qu'à un territoire :
 *  l'unicité (source, groupe) est garantie en base, on s'appuie dessus. */
export async function POST(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const { source, groupe, territoire_id } = await req.json()
  if (!source?.trim() || !groupe?.trim() || !territoire_id) {
    return NextResponse.json({ error: 'source, groupe et territoire_id requis' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('territoire_groupes')
    .upsert({ source: source.trim(), groupe: groupe.trim(), territoire_id }, { onConflict: 'source,groupe' })
    .select()
    .single()

  if (error) {
    // 23514 = la contrainte CHECK sur `source`. Message lisible plutôt que le
    // jargon Postgres : c'est exactement le cas « collecteur Facebook branché
    // avant que la migration soit jouée ».
    const lisible = error.code === '23514'
      ? `Source « ${source} » refusée par la base — jouer scripts/2026-09-19f_groupes_facebook.sql`
      : error.message
    return NextResponse.json({ error: lisible }, { status: 400 })
  }
  return NextResponse.json(data)
}

/** Retire une déclaration. Le groupe retombe alors sur le territoire par
 *  défaut — rien ne casse, le géocodage perd juste son repère. */
export async function DELETE(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

  const { error } = await supabaseAdmin.from('territoire_groupes').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/** Les réglages géographiques d'un territoire : ses deux rayons et le repère
 *  envoyé à Google. Ce sont eux qui décident de l'arbitrage à l'ingestion. */
export async function PATCH(req: NextRequest) {
  const ctx = await requireAdmin(req)
  if (ctx instanceof Response) return ctx

  const { id, rayon_insertion_km, rayon_affichage_km, indice_geo } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

  const maj: Record<string, unknown> = {}
  if (rayon_insertion_km != null) maj.rayon_insertion_km = Math.max(1, Math.round(Number(rayon_insertion_km)))
  if (rayon_affichage_km != null) maj.rayon_affichage_km = Math.max(1, Math.round(Number(rayon_affichage_km)))
  if (typeof indice_geo === 'string' && indice_geo.trim()) maj.indice_geo = indice_geo.trim()
  if (!Object.keys(maj).length) return NextResponse.json({ error: 'rien a modifier' }, { status: 400 })

  const { error } = await supabaseAdmin.from('territoires').update(maj).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Le cache des territoires tient 60 s : on l'oublie pour cette instance,
  // les autres rattraperont d'elles-mêmes.
  oublierTerritoires()
  return NextResponse.json({ ok: true })
}
