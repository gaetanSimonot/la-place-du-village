import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { normalizeHubOrder } from '@/lib/hubSections'
import { choisirTuilesDuJour, type EvenementTuile } from '@/lib/hubTodayPicker'

/**
 * Valide une date YYYY-MM-DD venant du client. Retourne la date validée OU
 * la date serveur si :
 *  - format invalide
 *  - écart > 1.5 jour avec la date serveur (anti-poisoning du cache CDN par
 *    un user envoyant ?d=2050-01-01)
 *
 * Tolérance 1.5j pour couvrir les fuseaux extrêmes (+/- 14h) sans bloquer
 * les users légitimes.
 */
function validateClientDate(clientDate: string | null): string {
  const serverYMD = new Date().toISOString().slice(0, 10)
  if (!clientDate || !/^\d{4}-\d{2}-\d{2}$/.test(clientDate)) return serverYMD
  const clientTs = Date.parse(clientDate + 'T00:00:00Z')
  // Une chaîne bien formatée mais impossible (ex: 2026-13-45) passe la regex
  // mais retourne NaN ici. Sans ce guard, NaN > x est toujours false → la
  // valeur clientDate serait acceptée et créerait des entrées CDN parasites.
  if (Number.isNaN(clientTs)) return serverYMD
  const serverTs = Date.parse(serverYMD + 'T00:00:00Z')
  if (!isFinite(serverTs)) return serverYMD
  if (Math.abs(clientTs - serverTs) > 1.5 * 86400 * 1000) return serverYMD
  return clientDate
}

/**
 * GET /api/hub — payload unique pour la home (HubView).
 *
 * Regroupe en 1 round-trip les ~13 requêtes Supabase que HubView lançait
 * en parallèle depuis le client. Tout le contenu est PUBLIC (mêmes data
 * pour tous les visiteurs) → cacheable CDN/Vercel pour réduire la charge
 * et accélérer le rendu.
 *
 * Cache : s-maxage=60 (CDN garde 60s) + stale-while-revalidate=120
 * (sert le cache même périmé, refresh en background) → la home charge
 * en <100ms après le premier hit, et un déploiement / changement
 * (featured_slots / journal / etc.) se propage au max en 60-180s.
 *
 * PERSO (favoris, plan user) reste côté client via useFavorites / useAuth.
 * Pas inclus ici car ça casserait le cache (response variable par user).
 */

export const revalidate = 60

type HeroItem =
  | { kind: 'evenement';     data: Record<string, unknown>; imagePosition: string | null }
  | { kind: 'etablissement'; data: Record<string, unknown>; imagePosition: string | null }
  | { kind: 'producteur';    data: Record<string, unknown>; imagePosition: string | null }
  | { kind: 'forum_topic';   data: Record<string, unknown>; imagePosition: string | null }

interface PromoCard {
  id: string
  title?: string | null
  description?: string | null
  image_url?: string | null
  display_image_url?: string | null
  etablissement?: { nom: string | null; commune: string | null } | null
  [key: string]: unknown
}

export async function GET(req: NextRequest) {
  // todayISO : date locale du téléphone validée (param ?d=YYYY-MM-DD), fallback
  // serveur si manquant/invalide/trop loin. Évite le décalage UTC (events
  // "aujourd'hui" basés sur le fuseau de l'user) + cache cohérent par jour.
  const { searchParams } = new URL(req.url)
  const todayISO = validateClientDate(searchParams.get('d'))
  const inAWeek = new Date(todayISO + 'T00:00:00Z'); inAWeek.setUTCDate(inAWeek.getUTCDate() + 7)
  const weekISO = inAWeek.toISOString().slice(0, 10)
  const nowISO  = new Date().toISOString()

  // ── PARALLÈLE 1er niveau : counts + configs + featured + today/week + journal + covoits ──
  const [
    evtCountRes,
    etabCountRes,
    prodCountRes,
    introCfgRes,
    introImgRes,
    sectionOrderRes,
    sectionHiddenRes,
    heroSlotsRes,
    promoSlotsRes,
    venteSlotsRes,
    eventSlotsRes,
    todayEventsRes,
    journalRes,
    covoitsRes,
    allPromosRes,
    topForumRes,
  ] = await Promise.all([
    supabaseAdmin.from('evenements').select('*', { count: 'exact', head: true }).eq('statut', 'publie'),
    supabaseAdmin.from('etablissements').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('producers').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('config').select('value').eq('key', 'hub_hero_intro_enabled').maybeSingle(),
    supabaseAdmin.from('config').select('value').eq('key', 'hub_hero_intro_image_url').maybeSingle(),
    supabaseAdmin.from('config').select('value').eq('key', 'hub_section_order').maybeSingle(),
    supabaseAdmin.from('config').select('value').eq('key', 'hub_section_hidden').maybeSingle(),
    supabaseAdmin
      .from('featured_slots')
      .select('content_type, content_id, priority, image_position')
      .eq('slot', 'hub_hero')
      .lte('starts_at', nowISO)
      .gt('ends_at', nowISO)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('featured_slots')
      .select('content_id, priority')
      .eq('slot', 'homepage')
      .eq('content_type', 'promotion')
      .lte('starts_at', nowISO)
      .gt('ends_at', nowISO)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('featured_slots')
      .select('content_id, priority')
      .eq('slot', 'homepage')
      .eq('content_type', 'annonce')
      .lte('starts_at', nowISO)
      .gt('ends_at', nowISO)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('featured_slots')
      .select('content_id, position')
      .eq('slot', 'homepage')
      .eq('content_type', 'evenement')
      .lte('starts_at', nowISO)
      .gt('ends_at', nowISO)
      .not('position', 'is', null)
      .order('position', { ascending: true }),
    // limit 40 (et non 8) : depuis les marchés, une dizaine d'événements du
    // jour sont à 07:00-08:00. Avec une fenêtre de 8, un concert à 20h30
    // n'était même pas CANDIDAT au choix des tuiles — pas mal classé, absent.
    // Le tri par intérêt se fait ensuite dans choisirTuilesDuJour().
    supabaseAdmin
      .from('evenements')
      .select('*, lieux(*)', { count: 'exact' })
      .eq('statut', 'publie')
      .eq('date_debut', todayISO)
      .order('heure', { ascending: true, nullsFirst: false })
      .limit(40),
    supabaseAdmin
      .from('journaux_hebdo')
      .select('id, numero, cover_titre, cover_image_url, temps_lecture_min, publie_at, position_hub')
      .eq('statut', 'publie')
      .order('numero', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('covoiturages')
      .select('id, depart, destination, date_trajet, heure_depart, prix, places, places_prises, statut')
      .neq('statut', 'annule')
      .gte('date_trajet', todayISO)
      .order('date_trajet', { ascending: true })
      .order('heure_depart', { ascending: true })
      .limit(3),
    // Toutes les promos actives non expirées (filtrées ensuite par plan owner)
    supabaseAdmin
      .from('promotions')
      .select('*')
      .eq('active', true)
      .or(`valid_until.is.null,valid_until.gte.${nowISO}`)
      .order('created_at', { ascending: false }),
    // Top sujets du forum (même tri que la liste /forum) → bento Place publique
    supabaseAdmin
      .from('forum_topics')
      .select('id, user_id, titre, media, poll, comment_count, like_count, last_activity_at')
      .order('pinned', { ascending: false })
      .order('comment_count', { ascending: false })
      .order('last_activity_at', { ascending: false })
      .limit(4),
  ])

  // ── HERO carousel : résoudre featured items + fallback today/week ──
  const heroSlots = heroSlotsRes.data ?? []
  const heroItems: HeroItem[] = []

  if (heroSlots.length > 0) {
    const evIds   = heroSlots.filter(s => s.content_type === 'evenement').map(s => s.content_id)
    const etabIds = heroSlots.filter(s => s.content_type === 'etablissement').map(s => s.content_id)
    const prodIds = heroSlots.filter(s => s.content_type === 'producteur').map(s => s.content_id)
    const topicIds = heroSlots.filter(s => s.content_type === 'forum_topic').map(s => s.content_id)

    const [evRes, etabRes, prodRes, topicRes] = await Promise.all([
      evIds.length   ? supabaseAdmin.from('evenements').select('*, lieux(*)').in('id', evIds).eq('statut', 'publie') : Promise.resolve({ data: [] }),
      etabIds.length ? supabaseAdmin.from('etablissements').select('id, nom, commune, photos, type').in('id', etabIds) : Promise.resolve({ data: [] }),
      prodIds.length ? supabaseAdmin.from('producers').select('id, nom, commune, photos').in('id', prodIds) : Promise.resolve({ data: [] }),
      topicIds.length ? supabaseAdmin.from('forum_topics').select('id, titre, media').in('id', topicIds) : Promise.resolve({ data: [] }),
    ])

    const evMap   = Object.fromEntries(((evRes.data ?? []) as Record<string, unknown>[]).map(e => [e.id as string, e]))
    const etabMap = Object.fromEntries(((etabRes.data ?? []) as Record<string, unknown>[]).map(e => [e.id as string, e]))
    const prodMap = Object.fromEntries(((prodRes.data ?? []) as Record<string, unknown>[]).map(p => [p.id as string, p]))
    const topicMap = Object.fromEntries(((topicRes.data ?? []) as Record<string, unknown>[]).map(t => [t.id as string, t]))

    heroSlots.forEach(s => {
      const pos = (s.image_position as string | null) ?? null
      if (s.content_type === 'evenement' && evMap[s.content_id]) {
        heroItems.push({ kind: 'evenement', data: evMap[s.content_id], imagePosition: pos })
      } else if (s.content_type === 'etablissement' && etabMap[s.content_id]) {
        heroItems.push({ kind: 'etablissement', data: etabMap[s.content_id], imagePosition: pos })
      } else if (s.content_type === 'producteur' && prodMap[s.content_id]) {
        heroItems.push({ kind: 'producteur', data: prodMap[s.content_id], imagePosition: pos })
      } else if (s.content_type === 'forum_topic' && topicMap[s.content_id]) {
        heroItems.push({ kind: 'forum_topic', data: topicMap[s.content_id], imagePosition: pos })
      }
    })
  }

  // Fallback 1 : event du jour si pas de featured
  if (heroItems.length === 0) {
    const { data } = await supabaseAdmin
      .from('evenements')
      .select('*, lieux(*)')
      .eq('statut', 'publie')
      .eq('date_debut', todayISO)
      .order('promo_ordre', { ascending: false })
      .limit(1)
    const ev = (data?.[0] as Record<string, unknown> | undefined) ?? null
    if (ev) heroItems.push({ kind: 'evenement', data: ev, imagePosition: (ev.image_position as string | null) ?? null })
  }

  // Fallback 2 : event de la semaine
  if (heroItems.length === 0) {
    const { data } = await supabaseAdmin
      .from('evenements')
      .select('*, lieux(*)')
      .eq('statut', 'publie')
      .gte('date_debut', todayISO)
      .lte('date_debut', weekISO)
      .order('date_debut', { ascending: true })
      .limit(1)
    const ev = (data?.[0] as Record<string, unknown> | undefined) ?? null
    if (ev) heroItems.push({ kind: 'evenement', data: ev, imagePosition: (ev.image_position as string | null) ?? null })
  }

  // ── PROMOS : enrichir + filter (réplique exacte de /api/promotions GET public) ──
  const promoSlotsIds = (promoSlotsRes.data ?? []).map(s => s.content_id as string)
  const featuredPromoIds = new Set(promoSlotsIds)
  const allPromos = (allPromosRes.data ?? []) as Array<Record<string, unknown>>

  let visiblePromos: PromoCard[] = []
  if (allPromos.length > 0) {
    const etabIds = Array.from(new Set(allPromos.map(p => p.etablissement_id as string)))
    const { data: etabs } = await supabaseAdmin
      .from('etablissements')
      .select('id, nom, commune, photos, type, plan, user_id')
      .in('id', etabIds)
    const etabsById = Object.fromEntries((etabs ?? []).map(e => [e.id, e]))

    const ownerIds = Array.from(new Set(
      Object.values(etabsById).map(e => (e as { user_id?: string | null }).user_id).filter(Boolean) as string[]
    ))
    const { data: profiles } = ownerIds.length
      ? await supabaseAdmin.from('profiles').select('user_id, plan').in('user_id', ownerIds)
      : { data: [] }
    const profileByUser = Object.fromEntries((profiles ?? []).map(p => [p.user_id, p]))

    visiblePromos = allPromos
      .filter(p => {
        const etab = etabsById[p.etablissement_id as string] as { user_id?: string | null } | undefined
        if (!etab?.user_id) return false
        if (p.user_id !== etab.user_id) return false
        const proprio = profileByUser[etab.user_id] as { plan?: string } | undefined
        return proprio?.plan === 'pro'
      })
      .map(p => {
        const etab = etabsById[p.etablissement_id as string] as { photos?: string[] | null } | undefined
        const display_image_url = (p.image_url as string | null) || (etab?.photos?.[0] ?? null)
        return { ...p, etablissement: etabsById[p.etablissement_id as string] ?? null, display_image_url } as PromoCard
      })
  }

  // Reorder : promos featured d'abord, puis le reste
  const orderedPromos: PromoCard[] = []
  promoSlotsIds.forEach(id => {
    const p = visiblePromos.find(x => x.id === id)
    if (p) orderedPromos.push(p)
  })
  visiblePromos.forEach(p => { if (!featuredPromoIds.has(p.id)) orderedPromos.push(p) })

  // ── VENTES : featured annonces puis enchères inversées en baisse ──
  const venteFeaturedIds = (venteSlotsRes.data ?? []).map(s => s.content_id as string)
  const ordered: Array<Record<string, unknown>> = []
  const seen = new Set<string>()

  if (venteFeaturedIds.length > 0) {
    const { data: featuredAnnonces } = await supabaseAdmin
      .from('annonces')
      .select('*')
      .in('id', venteFeaturedIds)
      .eq('statut', 'active')
    const map = Object.fromEntries(((featuredAnnonces ?? []) as Array<Record<string, unknown>>).map(a => [a.id as string, a]))
    venteFeaturedIds.forEach(id => {
      const a = map[id]
      if (a && !seen.has(a.id as string)) { ordered.push(a); seen.add(a.id as string) }
    })
  }

  if (ordered.length < 4) {
    const { data: encheres } = await supabaseAdmin
      .from('annonces')
      .select('*')
      .eq('statut', 'active')
      .eq('type', 'enchere_inversee')
      .not('prix_actuel', 'is', null)
      .not('prix_initial', 'is', null)
      .order('created_at', { ascending: false })
      .limit(12)
    ;((encheres ?? []) as Array<Record<string, unknown>>).forEach(a => {
      if (seen.has(a.id as string)) return
      const pa = a.prix_actuel as number | null
      const pi = a.prix_initial as number | null
      if (pa != null && pi != null && pa < pi) {
        ordered.push(a); seen.add(a.id as string)
      }
    })
  }

  // Fallback : si toujours pas 4 (ni mise en avant, ni enchère en baisse), on
  // complète avec les annonces actives les plus récentes (tout type) → la
  // section homepage n'est jamais vide.
  if (ordered.length < 4) {
    const { data: recentes } = await supabaseAdmin
      .from('annonces')
      .select('*')
      .in('statut', ['active', 'don_final'])
      .order('created_at', { ascending: false })
      .limit(12)
    ;((recentes ?? []) as Array<Record<string, unknown>>).forEach(a => {
      if (ordered.length >= 4 || seen.has(a.id as string)) return
      ordered.push(a); seen.add(a.id as string)
    })
  }

  // Total réel d'annonces visibles (toutes catégories) pour le compteur "· N"
  // de la section, indépendant des 4 cartes affichées. Aligné sur la liste
  // publique /annonces (statut active|don_final).
  const { count: annoncesTotal } = await supabaseAdmin
    .from('annonces')
    .select('id', { count: 'exact', head: true })
    .in('statut', ['active', 'don_final'])

  // ── EVENTS HOMEPAGE : positionnement explicite 1/2/3 par l'admin, complété
  // par les events du jour sur les positions laissées vides. Section a 3
  // emplacements (1 grosse + 2 mini), donc on construit un array de longueur 3
  // dans l'ordre [pos1, pos2, pos3] et chaque slot vide est rempli avec un
  // event du jour non déjà utilisé (par id).
  type EventRow = Record<string, unknown>
  const eventSlots = (eventSlotsRes.data ?? []) as Array<{ content_id: string; position: number }>
  const candidatsDuJour = (todayEventsRes.data ?? []) as EventRow[]

  // Positions forcées par l'admin (bouton « mettre en avant »). Elles gagnent
  // toujours : aucune règle de tri ne s'applique à elles.
  const imposes = new Map<number, EventRow>()
  if (eventSlots.length > 0) {
    const featuredIds = eventSlots.map(s => s.content_id)
    const { data: featuredEvts } = await supabaseAdmin
      .from('evenements')
      .select('*, lieux(*)')
      .in('id', featuredIds)
      .eq('statut', 'publie')
    const featuredMap = Object.fromEntries(
      ((featuredEvts ?? []) as EventRow[]).map(e => [e.id as string, e]),
    )
    for (const slot of eventSlots) {
      const evt = featuredMap[slot.content_id]
      if (evt) imposes.set(slot.position, evt)
    }
  }

  // Remplissage automatique des positions libres : tuile 1 jamais un marché,
  // un marché maximum sur les trois, pas deux fois la même catégorie.
  // Cf. src/lib/hubTodayPicker.ts pour les règles complètes.
  const finalTodayEvents = choisirTuilesDuJour(
    candidatsDuJour as unknown as EvenementTuile[],
    imposes as unknown as Map<number, EvenementTuile>,
    3,
  ) as unknown as EventRow[]

  // ── FORUM : top sujets enrichis de l'auteur ──
  const topRows = (topForumRes.data ?? []) as Record<string, unknown>[]
  let forumTopics: Record<string, unknown>[] = []
  if (topRows.length > 0) {
    const uids = Array.from(new Set(topRows.map(t => t.user_id as string)))
    const { data: profs } = await supabaseAdmin
      .from('profiles')
      .select('user_id, display_name')
      .in('user_id', uids)
    const pm = Object.fromEntries((profs ?? []).map(p => [p.user_id, p.display_name]))
    forumTopics = topRows.map(t => ({ ...t, author_name: pm[t.user_id as string] ?? null }))
  }

  // ── PAYLOAD ──
  const payload = {
    zoneCounts: {
      evt:  evtCountRes.count  ?? 0,
      etab: etabCountRes.count ?? 0,
      prod: prodCountRes.count ?? 0,
      // peopleCount délibérément exclu du payload public /api/hub :
      // l'info "nombre de membres" n'est visible qu'aux users loggés
      // qui consultent /people (via /api/people qui exige requireUser).
    },
    heroItems,
    introEnabled:  introCfgRes.data?.value === 'true',
    introImageUrl: introImgRes.data?.value || null,
    todayEvents: finalTodayEvents,
    // todayTotal reste le compteur des events publiés du jour, indépendant
    // du featured admin — ça sert le badge "X events aujourd'hui" qui doit
    // refléter l'activité réelle, pas le choix éditorial.
    todayTotal:  todayEventsRes.count ?? 0,
    promos:      orderedPromos.slice(0, 8),
    ventes:      ordered.slice(0, 4),
    ventesTotal: annoncesTotal ?? ordered.length,
    journal:     journalRes.data ?? null,
    covoits:     covoitsRes.data ?? [],
    forumTopics,
    sectionOrder: normalizeHubOrder((() => {
      try { return JSON.parse(sectionOrderRes.data?.value ?? '[]') } catch { return [] }
    })()),
    sectionHidden: (() => {
      try {
        const v = JSON.parse(sectionHiddenRes.data?.value ?? '[]')
        return Array.isArray(v) ? v.filter((x: unknown): x is string => typeof x === 'string') : []
      } catch { return [] }
    })(),
  }

  return NextResponse.json(payload, {
    headers: {
      // CDN cache 60s + sert le périmé pendant 120s en background refresh
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
    },
  })
}
