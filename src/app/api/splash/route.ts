import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/splash — données des rubriques du splash éditorial.
 * Pour l'instant : valeurs par défaut tirées des sources réelles (no-mock).
 * Le système de SÉLECTION (mettre en avant tel pro / telle tuile) viendra
 * dans une étape ultérieure.
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

  const [todayCntRes, weekendCntRes, debatesRes, topicRes, journalRes, promoCfgRes, momentRes, heroRes] = await Promise.all([
    supabaseAdmin.from('evenements').select('id', { count: 'exact', head: true }).eq('statut', 'publie').eq('date_debut', today),
    supabaseAdmin.from('evenements').select('id', { count: 'exact', head: true }).eq('statut', 'publie').in('date_debut', [sat, sun]),
    supabaseAdmin.from('forum_topics').select('id', { count: 'exact', head: true }).not('poll', 'is', null),
    supabaseAdmin.from('forum_topics').select('id, titre').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from('journaux_hebdo').select('numero, cover_titre, cover_kicker').eq('statut', 'publie').order('numero', { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from('config').select('value').eq('key', 'promo_carousel').maybeSingle(),
    supabaseAdmin.from('moments').select('id, auteur_id, media_kind, media_url, poster_url, legende').eq('sur_accueil', true).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from('config').select('value').eq('key', 'hub_hero_intro_image_url').maybeSingle(),
  ])

  // Image héro = celle du « hub hero intro » choisie par l'admin (sinon fallback côté client)
  const hero = (heroRes.data?.value as string | undefined) || null

  // ── Aujourd'hui ─────────────────────────────────────────────────────────
  const aujourdhui = {
    today: todayCntRes.count ?? 0,
    weekend: weekendCntRes.count ?? 0,
    debates: debatesRes.count ?? 0,
  }

  // ── Ça fait parler (forum) ──────────────────────────────────────────────
  let caFaitParler: { id: string; titre: string; comments: number; votes: number } | null = null
  const topic = topicRes.data as { id: string; titre: string } | null
  if (topic) {
    const [cRes, vRes] = await Promise.all([
      supabaseAdmin.from('forum_comments').select('id', { count: 'exact', head: true }).eq('topic_id', topic.id),
      supabaseAdmin.from('forum_poll_votes').select('id', { count: 'exact', head: true }).eq('topic_id', topic.id),
    ])
    caFaitParler = { id: topic.id, titre: topic.titre, comments: cRes.count ?? 0, votes: vRes.count ?? 0 }
  }

  // ── Journal ─────────────────────────────────────────────────────────────
  const j = journalRes.data as { numero: number; cover_titre: string | null; cover_kicker: string | null } | null
  const journal = j ? { numero: j.numero, titre: j.cover_titre ?? `Journal n°${j.numero}`, deck: j.cover_kicker ?? '' } : null

  // ── Bon plan du jour (coup de cœur, sinon dernière promo active) ─────────
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

  // ── Vu aujourd'hui (moment) ─────────────────────────────────────────────
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

  return NextResponse.json({ hero, aujourdhui, caFaitParler, journal, bonPlan, vuAujourdhui })
}
