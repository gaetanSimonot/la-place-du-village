import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getDateRange } from '@/lib/filters'
import type { FiltreQuand } from '@/lib/types'

/**
 * GET /api/agenda — payload unique pour la liste des événements.
 *
 * Avant : page.tsx en mode agenda lançait 3-5 requêtes Supabase parallèles
 * (events filtrés, promo events, splash featured, config masquer_passes).
 * Après : 1 fetch HTTP qui retourne tout en 1 round-trip.
 *
 * Query params :
 *   ?cat=concert,marche,atelier   (CSV catégories — vide = toutes)
 *   ?quand=cette_semaine          (FiltreQuand — défaut: toujours)
 *   ?masquerPasses=1              (0/1 — défaut: 0)
 *
 * Cache : variant par URL (chaque combinaison filtres = sa propre entrée
 * CDN). 60s s-maxage + 120s SWR.
 *
 * PUBLIC : pas de requireUser. Les filtres viennent du client mais ne
 * révèlent rien de personnel.
 */

export const revalidate = 60

/** Garde-fou mémoire, pas un filtre éditorial : voir le commentaire au .limit(). */
const PLAFOND = 2000

const SELECT = 'id, titre, categorie, categories, date_debut, date_fin, heure, image_url, image_position, promotion, promo_ordre, lieux(id, nom, commune, lat, lng, place_id_google)'

const QUAND_VALUES: FiltreQuand[] = ['toujours', 'aujourd_hui', 'cette_semaine', 'ce_week_end', 'ce_mois']

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const catCsv = (searchParams.get('cat') ?? '').trim()
  const quandRaw = (searchParams.get('quand') ?? 'toujours').trim()
  const masquerPasses = searchParams.get('masquerPasses') === '1'

  const cats = catCsv ? catCsv.split(',').map(s => s.trim()).filter(Boolean) : []
  const quand: FiltreQuand = QUAND_VALUES.includes(quandRaw as FiltreQuand) ? (quandRaw as FiltreQuand) : 'toujours'
  // Date précise venant du calendrier. Validée strictement (YYYY-MM-DD) : elle
  // part directement dans un filtre PostgREST, on ne laisse pas passer de
  // chaîne arbitraire depuis le client.
  const dateRaw = (searchParams.get('date') ?? '').trim()
  const dateExacte = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : null
  const nowISO = new Date().toISOString()
  // Déclarée ici : le tri final en a besoin, hors du bloc qui la calcule.
  let range: { from: string; to: string } | null = null

  // ── PARALLÈLE : events filtrés + promo events + splash featured + config ──

  // Build query principale
  let q = supabaseAdmin.from('evenements').select(SELECT)
    .eq('statut', 'publie')
    .order('date_debut', { ascending: true })
    // Pas de plafond arbitraire : à 300, l'agenda était TRONQUÉ en silence.
    // Mesuré le 03/09/2026 : 654 événements à venir, 300 renvoyés — plus de
    // 350 n'étaient visibles nulle part, et comme le tri est chronologique
    // c'étaient les plus lointains qui sautaient. On garde une borne haute,
    // uniquement comme garde-fou mémoire ; si elle est atteinte un jour, le
    // champ `tronque` de la réponse le dira au lieu de le taire.
    .limit(PLAFOND)
  // Filtre par recouvrement : l'event matche si UNE de ses catégories est
  // sélectionnée (multi-catégories). `categories` est backfillé pour toutes
  // les lignes par la migration 2026-06-18.
  if (cats.length > 0) q = q.overlaps('categories', cats)

  // Date précise (calendrier) : prime sur `quand`. Contrairement aux filtres
  // de période qui bornent `date_debut`, on veut ici "ce qui se passe CE
  // jour-là" — donc un événement multi-jours (expo du 1er au 20) doit sortir
  // le 5. D'où le recouvrement : date_debut <= d ET (date_fin >= d OU
  // événement d'un seul jour tombant pile ce jour).
  // masquerPasses est volontairement ignoré dans ce cas : l'utilisateur a
  // explicitement demandé une date, même passée.
  if (dateExacte) {
    q = q.lte('date_debut', dateExacte)
         .or(`date_fin.gte.${dateExacte},and(date_fin.is.null,date_debut.eq.${dateExacte})`)
  } else {
    range = getDateRange(quand)
    // Recouvrement, exactement comme le calendrier juste au-dessus : on veut
    // ce qui est EN COURS pendant la période, pas seulement ce qui COMMENCE
    // dedans. Sans ça, une expo ouverte le 1er juin et courant jusqu'au 30
    // septembre disparaissait de « Aujourd'hui » dès le 2 juin — comme
    // l'Atelier Vélo, les Puces de Ganges ou la permanence Créa.Dév, mesurés
    // absents en production le 03/09/2026.
    if (range) {
      q = q.lte('date_debut', range.to)
           .or(`date_fin.gte.${range.from},and(date_fin.is.null,date_debut.gte.${range.from})`)
    }
    if (masquerPasses) {
      // Force Europe/Paris (Vercel = UTC par défaut, peu importe la région).
      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Paris',
        year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date())
      q = q.or(`date_fin.gte.${today},and(date_fin.is.null,date_debut.gte.${today})`)
    }
  }

  // Promo events (pro/max), avec même filtre masquerPasses mais SANS cat / quand
  // (la promotion est globale, peu importe ce que l'user filtre)
  let pq = supabaseAdmin.from('evenements').select(SELECT)
    .eq('statut', 'publie')
    .in('promotion', ['pro', 'max'])
    .order('date_debut', { ascending: true })
  if (masquerPasses) {
    // Force Europe/Paris (Vercel = UTC par défaut, peu importe la région).
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Paris',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date())
    pq = pq.or(`date_fin.gte.${today},and(date_fin.is.null,date_debut.gte.${today})`)
  }

  const [evRes, promoRes, splashSlotsRes] = await Promise.all([
    q,
    pq,
    supabaseAdmin
      .from('featured_slots')
      .select('content_id, priority')
      .eq('slot', 'splash')
      .eq('content_type', 'evenement')
      .lte('starts_at', nowISO)
      .gt('ends_at', nowISO)
      .order('priority', { ascending: false }),
  ])

  // Splash featured events (séparé car dépend de slots → events)
  const splashIds = (splashSlotsRes.data ?? []).map(s => s.content_id as string)
  let splashFeatured: Array<Record<string, unknown>> = []
  if (splashIds.length > 0) {
    const { data: events } = await supabaseAdmin
      .from('evenements')
      .select('id, titre, categorie, categories, date_debut, date_fin, heure, image_url, image_position, promotion, promo_ordre, vote_count, submitted_by_name, lieux(id, nom, commune, lat, lng, place_id_google)')
      .in('id', splashIds)
      .eq('statut', 'publie')
    const eventMap = Object.fromEntries(((events ?? []) as Array<Record<string, unknown>>).map(e => [e.id as string, e]))
    splashFeatured = splashIds.map(id => eventMap[id]).filter(Boolean) as Array<Record<string, unknown>>
  }

  // ── Ordre de la liste ────────────────────────────────────────────────
  // Ce qui se passe UNE FOIS passe devant ; ce qui dure ferme la marche.
  //
  // Le critère est la DURÉE, pas la date de début. Premier jet : « ce qui
  // commence dans la période d'abord » — insuffisant, parce qu'un parcours
  // ouvert le 1er septembre et courant jusqu'au 30 juin commence bel et bien
  // cette semaine, et repassait donc en tête. 302 jours devant le concert de
  // samedi.
  //
  // Au-delà d'une semaine, ce n'est plus un événement qu'on peut rater : une
  // expo, une permanence, un parcours à l'année sont des choses installées.
  // Elles restent visibles — c'était tout l'objet du filtre par recouvrement
  // — mais en fin de liste, derrière le frais.
  //
  // Vaut pour les DEUX chemins : les pastilles et le calendrier. Le premier
  // jet ne triait que les pastilles, donc choisir le 4 septembre ramenait les
  // expos en tête.
  const JOURS_INSTALLE = 7

  const dureeEnJours = (e: { date_debut?: string | null; date_fin?: string | null }): number => {
    if (!e.date_debut || !e.date_fin || e.date_fin === e.date_debut) return 0
    const d1 = Date.parse(`${e.date_debut}T12:00:00Z`)
    const d2 = Date.parse(`${e.date_fin}T12:00:00Z`)
    if (Number.isNaN(d1) || Number.isNaN(d2)) return 0
    return Math.round((d2 - d1) / 86_400_000)
  }

  const evenements = [...(evRes.data ?? [])]
  if (dateExacte || range) {
    evenements.sort((a, b) => {
      const ia = dureeEnJours(a) > JOURS_INSTALLE ? 1 : 0
      const ib = dureeEnJours(b) > JOURS_INSTALLE ? 1 : 0
      if (ia !== ib) return ia - ib
      return String(a.date_debut ?? '').localeCompare(String(b.date_debut ?? ''))
    })
  }

  return NextResponse.json({
    // Rend la troncature VISIBLE au lieu de la taire.
    tronque: (evRes.data ?? []).length >= PLAFOND,
    evenements,
    promoEvents:   promoRes.data ?? [],
    splashFeatured,
  }, {
    headers: {
      // Cache CDN 60s par variation URL (cat+quand+masquerPasses)
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
    },
  })
}
