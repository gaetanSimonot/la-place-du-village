import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/splash — données des rubriques du splash éditorial (sources réelles).
 */
function parisDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}
function weekendDates(): [string, string] {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', weekday: 'short' }).format(new Date())
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const day = map[wd] ?? 0
  const toSat = (6 - day + 7) % 7
  const sat = new Date(Date.now() + toSat * 86_400_000)
  const sun = new Date(sat.getTime() + 86_400_000)
  return [parisDate(sat), parisDate(sun)]
}

export async function GET() {
  const today = parisDate(new Date())
  const [sat, sun] = weekendDates()

  const [todayCntRes, weekendCntRes, topicsCntRes, commentsRes, journalRes, promoCfgRes, momentRes, heroRes, decouvrirRes] = await Promise.all([
    supabaseAdmin.from('evenements').select('id', { count: 'exact', head: true }).eq('statut', 'publie').eq('date_debut', today),
    supabaseAdmin.from('evenements').select('id', { count: 'exact', head: true }).eq('statut', 'publie').in('date_debut', [sat, sun]),
    supabaseAdmin.from('forum_topics').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('forum_comments').select('topic_id'),
    supabaseAdmin.from('journaux_hebdo').select('numero, cover_titre, cover_kicker').eq('statut', 'publie').order('numero', { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from('config').select('value').eq('key', 'promo_carousel').maybeSingle(),
    supabaseAdmin.from('moments').select('id, auteur_id, media_kind, media_url, poster_url, legende').eq('sur_accueil', true).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from('config').select('value').eq('key', 'splash_hero_image_url').maybeSingle(),
    supabaseAdmin.from('config').select('value').eq('key', 'splash_decouvrir').maybeSingle(),
  ])

  // Image héro = slot dédié du splash (config 'splash_hero_image_url'), indépendant
  // du carrousel/hub. Fallback sur l'image d'intro par défaut si non réglé.
  const hero = (heroRes.data?.value as string | undefined) || '/hub-intro-slide.webp'

  const aujourdhui = {
    today: todayCntRes.count ?? 0,
    weekend: weekendCntRes.count ?? 0,
    debates: topicsCntRes.count ?? 0,   // nb de sujets de la place publique
  }

  // ── Ça fait parler : sujet le plus commenté (sinon le plus récent) ──────
  const tally: Record<string, number> = {}
  for (const c of (commentsRes.data ?? []) as { topic_id: string }[]) {
    if (c.topic_id) tally[c.topic_id] = (tally[c.topic_id] ?? 0) + 1
  }
  const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1])
  const topId = ranked[0]?.[0] ?? null
  let topComments = topId ? ranked[0][1] : 0
  let topRow = topId
    ? (await supabaseAdmin.from('forum_topics').select('id, titre').eq('id', topId).maybeSingle()).data as { id: string; titre: string } | null
    : null
  if (!topRow) {
    topRow = (await supabaseAdmin.from('forum_topics').select('id, titre').order('created_at', { ascending: false }).limit(1).maybeSingle()).data as { id: string; titre: string } | null
    topComments = topRow ? (tally[topRow.id] ?? 0) : 0
  }
  let caFaitParler: { id: string; titre: string; comments: number; votes: number } | null = null
  if (topRow) {
    const { count: votes } = await supabaseAdmin.from('forum_poll_votes').select('*', { count: 'exact', head: true }).eq('topic_id', topRow.id)
    caFaitParler = { id: topRow.id, titre: topRow.titre, comments: topComments, votes: votes ?? 0 }
  }

  // ── Journal ─────────────────────────────────────────────────────────────
  const j = journalRes.data as { numero: number; cover_titre: string | null; cover_kicker: string | null } | null
  const journal = j ? { numero: j.numero, titre: j.cover_titre ?? `Journal n°${j.numero}`, deck: j.cover_kicker ?? '' } : null

  // ── Bon plan : coup de cœur (sinon dernière promo active) ────────────────
  let coupId: string | null = null
  try { coupId = promoCfgRes.data?.value ? JSON.parse(promoCfgRes.data.value).coupDeCoeur ?? null : null } catch { /* noop */ }
  const promoQ = supabaseAdmin.from('promotions').select('id, title, description, image_url, etablissement_id').eq('active', true)
  const { data: promoRow } = coupId
    ? await promoQ.eq('id', coupId).maybeSingle()
    : await promoQ.order('created_at', { ascending: false }).limit(1).maybeSingle()
  let bonPlan: { id: string; titre: string; sous: string | null; image: string | null; etab: string | null } | null = null
  if (promoRow) {
    const { data: etab } = promoRow.etablissement_id
      ? await supabaseAdmin.from('etablissements').select('nom, photos').eq('id', promoRow.etablissement_id).maybeSingle()
      : { data: null }
    bonPlan = {
      id: promoRow.id as string,
      titre: (promoRow.title as string) ?? 'Bon plan',
      sous: (promoRow.description as string | null) ?? null,
      image: (promoRow.image_url as string | null) || ((etab?.photos as string[] | null)?.[0] ?? null),
      etab: (etab?.nom as string) ?? null,
    }
  }

  // ── Vu aujourd'hui (moment) — sinon À découvrir (item admin) ─────────────
  const m = momentRes.data as { id: string; auteur_id: string; media_kind: string; media_url: string; poster_url: string | null; legende: string | null } | null
  let vuAujourdhui: { id: string; titre: string; auteur: string; image: string | null } | null = null
  if (m) {
    const { data: prof } = await supabaseAdmin.from('profiles').select('display_name').eq('user_id', m.auteur_id).maybeSingle()
    vuAujourdhui = {
      id: m.id,
      titre: m.legende || 'Un moment au village',
      auteur: (prof?.display_name as string) ?? 'Un habitant',
      image: m.media_kind === 'video' ? (m.poster_url ?? null) : m.media_url,
    }
  }
  let decouvrir: { kind: string; id: string; title: string; subtitle: string | null; photo: string | null } | null = null
  try { if (decouvrirRes.data?.value) decouvrir = JSON.parse(decouvrirRes.data.value) } catch { /* noop */ }

  return NextResponse.json(
    { hero, aujourdhui, caFaitParler, journal, bonPlan, vuAujourdhui, decouvrir },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
