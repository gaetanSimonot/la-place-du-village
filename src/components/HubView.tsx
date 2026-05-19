'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { EtablissementType, Evenement } from '@/lib/types'
import { getPrixAffiche, type Annonce } from '@/lib/annonces'
import HubTopBar from '@/components/HubTopBar'
import HubSearchBar from '@/components/HubSearchBar'
import { useFavorites } from '@/hooks/useFavorites'

interface Props {
  onSelectAgenda:        () => void
  onSelectAgendaToday?:  () => void
  onSelectAnnuaire:      (typeFilter?: EtablissementType) => void
  onSelectProducteurs:   () => void
  onComingSoon:          (label: string) => void
  onUpgradePrompt:       (requiredPlan: 'habitants' | 'pro', label: string) => void
  onOpenNotifs?:         () => void
  onOpenInfo?:           () => void
  onOpenSearch?:         () => void
  unreadCount?:          number
}

interface PromoCard {
  id: string
  title: string
  description: string | null
  image_url: string | null
  display_image_url: string | null
  etablissement: { nom: string; commune: string | null } | null
}

interface HeroEtab {
  id: string
  nom: string
  commune: string | null
  photos: string[] | null
  type: string | null
}

interface HeroProducteur {
  id: string
  nom: string
  commune: string | null
  photos: string[] | null
}

type HeroItem =
  | { kind: 'evenement';     data: Evenement;        imagePosition: string | null }
  | { kind: 'etablissement'; data: HeroEtab;         imagePosition: string | null }
  | { kind: 'producteur';    data: HeroProducteur;   imagePosition: string | null }

interface JournalLite {
  id: string
  numero: number
  cover_titre: string | null
  cover_image_url: string | null
  temps_lecture_min: number | null
  publie_at: string | null
}

const TILES: { id: string; label: string; iconSrc: string; click: (p: Props, router: ReturnType<typeof useRouter>) => void }[] = [
  { id: 'agenda',      label: 'Agenda',      iconSrc: '/icones-rondes/01_agenda_culturel.png',         click: p => p.onSelectAgenda() },
  { id: 'annuaire',    label: 'Annuaire',    iconSrc: '/icones-rondes/02_annuaire_professionnel.png',  click: p => p.onSelectAnnuaire() },
  { id: 'producteurs', label: 'Producteurs', iconSrc: '/icones-rondes/05_producteurs_vente_libre.png', click: p => p.onSelectProducteurs() },
  { id: 'annonces',    label: 'Annonces',    iconSrc: '/icones-rondes/07_annonces_locales.png',        click: (_, r) => r.push('/annonces') },
  { id: 'promos',      label: 'Bons plans',  iconSrc: '/icones-rondes/11_promotions_locales.png',      click: (_, r) => r.push('/promotions') },
]

function dateLabel(iso: string | null): string {
  if (!iso) return ''
  const today = new Date(); today.setHours(0,0,0,0)
  const d = new Date(iso); d.setHours(0,0,0,0)
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diff === 0)  return 'Aujourd\'hui'
  if (diff === 1)  return 'Demain'
  if (diff === -1) return 'Hier'
  if (diff > 1 && diff < 7) return d.toLocaleDateString('fr-FR', { weekday: 'long' })
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function formatElapsed(s: number): string {
  if (s < 60)    return `maj il y a ${s} sec`
  if (s < 3600)  return `maj il y a ${Math.floor(s / 60)} min`
  return 'maj récente'
}

function categorieKicker(c: string | null | undefined): string {
  if (!c) return 'ÉVÉNEMENT'
  return c.toUpperCase()
}

export default function HubView({
  onSelectAgenda, onSelectAgendaToday, onSelectAnnuaire, onSelectProducteurs,
  onComingSoon, onUpgradePrompt,
  onOpenNotifs, onOpenInfo, onOpenSearch, unreadCount = 0,
}: Props) {
  const router = useRouter()
  const { profile } = useAuth()
  const { favIds, toggle: toggleFav } = useFavorites()

  const [heroItems, setHeroItems] = useState<HeroItem[]>([])
  const [todayEvents, setTodayEvents] = useState<Evenement[]>([])
  const [todayTotal, setTodayTotal] = useState<number>(0)
  const [promos, setPromos] = useState<PromoCard[]>([])
  const [ventesAnnonces, setVentesAnnonces] = useState<Annonce[]>([])
  const [ventesTotal, setVentesTotal] = useState<number>(0)
  const [zoneCounts, setZoneCounts] = useState<{ evt: number; etab: number; prod: number }>({ evt: 0, etab: 0, prod: 0 })
  const [lastRefresh, setLastRefresh] = useState<number>(Date.now())
  const [elapsed, setElapsed] = useState<number>(0)
  const [journal, setJournal] = useState<JournalLite | null>(null)

  // Ticker "maj il y a X sec" — passe à 1s tant que <60s, puis tick à 60s
  useEffect(() => {
    const tick = () => setElapsed(Math.floor((Date.now() - lastRefresh) / 1000))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [lastRefresh])

  useEffect(() => {
    Promise.all([
      supabase.from('evenements').select('*', { count: 'exact', head: true }).eq('statut', 'publie'),
      supabase.from('etablissements').select('*', { count: 'exact', head: true }),
      supabase.from('producers').select('*', { count: 'exact', head: true }),
    ]).then(([evt, etab, prod]) => {
      setZoneCounts({ evt: evt.count ?? 0, etab: etab.count ?? 0, prod: prod.count ?? 0 })
    }).catch(() => {})
  }, [])

  // Hero carousel : 1. featured_slots hub_hero (events + etabs) > 2. today event > 3. week event
  const loadHero = useCallback(async () => {
      const todayISO = new Date().toISOString().slice(0, 10)
      const inAWeek = new Date(); inAWeek.setDate(inAWeek.getDate() + 7)
      const weekISO = inAWeek.toISOString().slice(0, 10)
      const nowISO  = new Date().toISOString()

      const { data: featuredSlots } = await supabase
        .from('featured_slots')
        .select('content_type, content_id, priority, image_position')
        .eq('slot', 'hub_hero')
        .lte('starts_at', nowISO)
        .gt('ends_at', nowISO)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false })

      const items: HeroItem[] = []
      if (featuredSlots && featuredSlots.length > 0) {
        const evIds   = featuredSlots.filter(s => s.content_type === 'evenement').map(s => s.content_id)
        const etabIds = featuredSlots.filter(s => s.content_type === 'etablissement').map(s => s.content_id)
        const prodIds = featuredSlots.filter(s => s.content_type === 'producteur').map(s => s.content_id)

        const [evRes, etabRes, prodRes] = await Promise.all([
          evIds.length > 0
            ? supabase.from('evenements').select('*, lieux(*)').in('id', evIds).eq('statut', 'publie')
            : Promise.resolve({ data: [] }),
          etabIds.length > 0
            ? supabase.from('etablissements').select('id, nom, commune, photos, type').in('id', etabIds)
            : Promise.resolve({ data: [] }),
          prodIds.length > 0
            ? supabase.from('producers').select('id, nom, commune, photos').in('id', prodIds)
            : Promise.resolve({ data: [] }),
        ])

        const evMap   = Object.fromEntries(((evRes.data ?? []) as Evenement[]).map(e => [e.id, e]))
        const etabMap = Object.fromEntries(((etabRes.data ?? []) as HeroEtab[]).map(e => [e.id, e]))
        const prodMap = Object.fromEntries(((prodRes.data ?? []) as HeroProducteur[]).map(p => [p.id, p]))

        featuredSlots.forEach(s => {
          const pos = (s.image_position as string | null) ?? null
          if (s.content_type === 'evenement' && evMap[s.content_id]) {
            items.push({ kind: 'evenement', data: evMap[s.content_id], imagePosition: pos })
          } else if (s.content_type === 'etablissement' && etabMap[s.content_id]) {
            items.push({ kind: 'etablissement', data: etabMap[s.content_id], imagePosition: pos })
          } else if (s.content_type === 'producteur' && prodMap[s.content_id]) {
            items.push({ kind: 'producteur', data: prodMap[s.content_id], imagePosition: pos })
          }
        })
      }

      if (items.length === 0) {
        const r = await supabase
          .from('evenements')
          .select('*, lieux(*)')
          .eq('statut', 'publie')
          .eq('date_debut', todayISO)
          .order('promo_ordre', { ascending: false })
          .limit(1)
        const ev = (r.data?.[0] as Evenement | undefined) ?? null
        if (ev) items.push({ kind: 'evenement', data: ev, imagePosition: ev.image_position ?? null })
      }

      if (items.length === 0) {
        const r = await supabase
          .from('evenements')
          .select('*, lieux(*)')
          .eq('statut', 'publie')
          .gte('date_debut', todayISO)
          .lte('date_debut', weekISO)
          .order('date_debut', { ascending: true })
          .limit(1)
        const ev = (r.data?.[0] as Evenement | undefined) ?? null
        if (ev) items.push({ kind: 'evenement', data: ev, imagePosition: ev.image_position ?? null })
      }

      setHeroItems(items)
  }, [])

  // Events du jour pour bento "Aujourd'hui" — 3 prochains + count exact
  const loadToday = useCallback(async () => {
      const today = new Date().toISOString().slice(0, 10)
      const { data, count } = await supabase
        .from('evenements')
        .select('*, lieux(*)', { count: 'exact' })
        .eq('statut', 'publie')
        .eq('date_debut', today)
        .order('heure', { ascending: true, nullsFirst: false })
        .limit(8)
      setTodayEvents((data ?? []) as Evenement[])
      setTodayTotal(count ?? 0)
  }, [])

  // Promotions actives
  const loadPromos = useCallback(async () => {
      const nowISO = new Date().toISOString()
      const featuredIds = new Set<string>()
      const ordered: PromoCard[] = []

      const { data: featuredSlots } = await supabase
        .from('featured_slots')
        .select('content_id')
        .eq('slot', 'homepage')
        .eq('content_type', 'promotion')
        .lte('starts_at', nowISO)
        .gt('ends_at', nowISO)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false })

      const featuredContentIds = (featuredSlots ?? []).map(s => s.content_id)
      featuredContentIds.forEach(id => featuredIds.add(id))

      const r = await fetch('/api/promotions').catch(() => null)
      const allPromos: PromoCard[] = r && r.ok ? ((await r.json())?.promotions ?? []) : []

      featuredContentIds.forEach(id => {
        const p = allPromos.find(x => x.id === id)
        if (p) ordered.push(p)
      })
      allPromos.forEach(p => { if (!featuredIds.has(p.id)) ordered.push(p) })

      setPromos(ordered.slice(0, 8))
  }, [])

  // Ventes — priorité admin pin (featured_slots), puis enchères inversées en baisse.
  // Cible 4 cards pour le bento 2x2.
  const loadVentes = useCallback(async () => {
      const nowISO = new Date().toISOString()
      const ordered: Annonce[] = []
      const seen = new Set<string>()

      // 1. Annonces pinées par l'admin (peu importe le type) en priorité
      const { data: featuredSlots } = await supabase
        .from('featured_slots')
        .select('content_id, priority')
        .eq('slot', 'homepage')
        .eq('content_type', 'annonce')
        .lte('starts_at', nowISO)
        .gt('ends_at', nowISO)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false })

      const featuredIds = (featuredSlots ?? []).map(s => s.content_id)
      if (featuredIds.length > 0) {
        const { data: featuredRows } = await supabase
          .from('annonces')
          .select('*')
          .in('id', featuredIds)
          .eq('statut', 'active')
        const map = Object.fromEntries(((featuredRows ?? []) as Annonce[]).map(a => [a.id, a]))
        featuredIds.forEach(id => {
          const a = map[id]
          if (a && !seen.has(a.id)) { ordered.push(a); seen.add(a.id) }
        })
      }

      // 2. Complète avec les enchères inversées en baisse réelle si pas plein
      if (ordered.length < 4) {
        const { data: encheres } = await supabase
          .from('annonces')
          .select('*')
          .eq('statut', 'active')
          .eq('type', 'enchere_inversee')
          .not('prix_actuel', 'is', null)
          .not('prix_initial', 'is', null)
          .order('created_at', { ascending: false })
          .limit(12)
        ;((encheres ?? []) as Annonce[]).forEach(a => {
          if (seen.has(a.id)) return
          if (a.prix_actuel != null && a.prix_initial != null && a.prix_actuel < a.prix_initial) {
            ordered.push(a); seen.add(a.id)
          }
        })
      }

      setVentesAnnonces(ordered.slice(0, 4))
      setVentesTotal(ordered.length)
  }, [])

  // Journal hebdo — dernier numéro publié (graceful empty)
  const loadJournal = useCallback(async () => {
      const { data, error } = await supabase
        .from('journaux_hebdo')
        .select('id, numero, cover_titre, cover_image_url, temps_lecture_min, publie_at')
        .eq('statut', 'publie')
        .order('numero', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) { setJournal(null); return }
      setJournal((data as JournalLite | null) ?? null)
  }, [])

  // Premier chargement
  useEffect(() => {
    loadHero()
    loadToday()
    loadPromos()
    loadVentes()
    loadJournal()
    setLastRefresh(Date.now())
  }, [loadHero, loadToday, loadPromos, loadVentes, loadJournal])

  // Realtime refetch sur changement featured_slots
  useEffect(() => {
    const ch = supabase
      .channel('hub-featured-slots')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'featured_slots' }, () => {
        loadHero()
        loadPromos()
        setLastRefresh(Date.now())
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [loadHero, loadPromos])

  // Refresh sur retour PWA / focus fenêtre
  useEffect(() => {
    const refreshAll = () => {
      loadHero()
      loadToday()
      loadPromos()
      loadVentes()
      loadJournal()
      setLastRefresh(Date.now())
    }
    const onVisible = () => { if (document.visibilityState === 'visible') refreshAll() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', refreshAll)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', refreshAll)
    }
  }, [loadHero, loadToday, loadPromos, loadVentes, loadJournal])

  const firstName = profile?.display_name?.split(' ')[0] || 'Visiteur'
  const totalNear = zoneCounts.evt + zoneCounts.etab + zoneCounts.prod
  const totalCarte = totalNear

  const [featuredEv, ...restEvents] = todayEvents
  const miniEvents = restEvents.slice(0, 2)

  return (
    <div className="min-h-full bg-creme pb-6 font-inter">
      <style>{`
        .pdv-hscroll { scrollbar-width: none; -webkit-overflow-scrolling: touch; }
        .pdv-hscroll::-webkit-scrollbar { display: none; }
      `}</style>

      {/* ── 1. Top bar ─────────────────────────────────────────────────── */}
      <HubTopBar
        onOpenMenu={onOpenInfo}
        onOpenNotifs={onOpenNotifs}
        unreadCount={unreadCount}
      />

      {/* ── 2. Search bar ─────────────────────────────────────────────── */}
      <HubSearchBar onClick={onOpenSearch} />

      {/* ── 3. Greeting + compteur live ───────────────────────────────── */}
      <div className="px-4 pt-[18px]">
        <h1
          className="m-0 font-serif text-[24px] leading-[1.1] text-texte"
          style={{ letterSpacing: '-0.01em' }}
        >
          Bonjour, {firstName}
        </h1>
        <p className="mt-1 text-[13px] text-texte-doux">
          <span className="font-semibold text-texte">{totalNear}</span> choses près de toi
          <span className="opacity-50"> · </span>
          {formatElapsed(elapsed)}
        </p>
      </div>

      {/* ── 4. Hero carousel À LA UNE ─────────────────────────────────── */}
      {heroItems.length > 0 && (
        <HubHeroCarousel
          items={heroItems}
          onSelect={item => {
            if      (item.kind === 'evenement')     router.push(`/evenement/${item.data.id}`)
            else if (item.kind === 'etablissement') router.push(`/etablissement/${item.data.id}`)
            else                                    router.push(`/producteur/${item.data.id}`)
          }}
        />
      )}

      {/* ── 5. Tiles 5 colonnes ───────────────────────────────────────── */}
      <div className="grid grid-cols-5 gap-x-2 gap-y-3 px-4 pb-1 pt-[18px]">
        {TILES.map(t => (
          <button
            key={t.id}
            onClick={() => t.click({ onSelectAgenda, onSelectAnnuaire, onSelectProducteurs, onComingSoon, onUpgradePrompt }, router)}
            className="flex flex-col items-center gap-1.5 bg-transparent p-0"
          >
            <div className="flex h-[52px] w-[52px] items-center justify-center overflow-hidden rounded-full border border-bord bg-white shadow-tile">
              <Image
                src={t.iconSrc}
                alt={t.label}
                width={48}
                height={48}
                className="h-[88%] w-[88%] object-contain"
                priority
              />
            </div>
            <span className="text-center text-[11px] font-semibold leading-[1.15] text-texte">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── 6. Aujourd'hui — bento featured + 2 mini ──────────────────── */}
      {todayEvents.length > 0 && (
        <>
          <SectionHeaderV3
            title="Aujourd'hui"
            kicker={`· ${todayTotal}`}
            subtitle={`${todayTotal} événement${todayTotal > 1 ? 's' : ''} près de chez vous`}
            action="Voir tout"
            onAction={onSelectAgendaToday ?? onSelectAgenda}
          />
          <div
            className="grid gap-2 px-4"
            style={{
              gridTemplateColumns: '1.25fr 1fr',
              gridTemplateRows: miniEvents.length >= 1 ? '1fr 1fr' : '1fr',
            }}
          >
            {featuredEv && (
              <FeaturedEventCard
                ev={featuredEv}
                onClick={() => router.push(`/evenement/${featuredEv.id}`)}
              />
            )}
            {miniEvents.map(ev => (
              <MiniEventCard
                key={ev.id}
                ev={ev}
                onClick={() => router.push(`/evenement/${ev.id}`)}
              />
            ))}
            {/* Combler la grille si on n'a qu'1 mini : ajout placeholder "+N" */}
            {featuredEv && miniEvents.length === 1 && todayTotal > 2 && (
              <MoreEventsCard
                count={todayTotal - 2}
                onClick={onSelectAgendaToday ?? onSelectAgenda}
              />
            )}
            {featuredEv && miniEvents.length === 0 && todayTotal > 1 && (
              <MoreEventsCard
                count={todayTotal - 1}
                onClick={onSelectAgendaToday ?? onSelectAgenda}
              />
            )}
          </div>
        </>
      )}

      {/* ── 7. Bons plans — 3 colonnes compactes ──────────────────────── */}
      {promos.length > 0 && (
        <>
          <SectionHeaderV3
            title="Bons plans"
            kicker={`· ${promos.length}`}
            subtitle="Chez vos commerçants partenaires"
            action="Voir tout"
            onAction={() => router.push('/promotions')}
          />
          <div className="grid grid-cols-3 gap-1.5 px-4">
            {promos.slice(0, 3).map(p => (
              <CompactPromoCard
                key={p.id}
                promo={p}
                onClick={() => router.push(`/promotions?id=${p.id}`)}
              />
            ))}
          </div>
        </>
      )}

      {/* ── 8. Ventes — 2x2 ───────────────────────────────────────────── */}
      {ventesAnnonces.length > 0 && (
        <>
          <SectionHeaderV3
            title="Ventes"
            kicker={`· ${ventesTotal}`}
            subtitle="Annonces en baisse cette semaine"
            action="Annonces"
            onAction={() => router.push('/annonces')}
          />
          <div className="grid grid-cols-2 gap-2 px-4">
            {ventesAnnonces.map(a => (
              <SaleAnnonceCard
                key={a.id}
                annonce={a}
                favored={favIds.includes(a.id)}
                onToggleFav={() => toggleFav(a.id)}
                onClick={() => router.push(`/annonces/${a.id}`)}
              />
            ))}
          </div>
        </>
      )}

      {/* ── 9. Bottom bento — Carte (1.5fr) + Journal (1fr) ───────────── */}
      <div
        className="grid gap-2 px-4 pt-6"
        style={{ gridTemplateColumns: '1.5fr 1fr' }}
      >
        <CarteTile
          counts={zoneCounts}
          total={totalCarte}
          onClick={onSelectAgenda}
        />
        <JournalTile
          journal={journal}
          onClick={() => {
            if (journal) router.push(`/journal/${journal.numero}`)
            else router.push('/journal')
          }}
        />
      </div>
    </div>
  )
}

/* ─── SectionHeader V3 ───────────────────────────────────────────────── */

function SectionHeaderV3({
  title, kicker, subtitle, action, onAction,
}: {
  title: string
  kicker?: string
  subtitle?: string
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="px-4 pb-3 pt-6">
      <div className="flex items-baseline justify-between gap-2.5">
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <h3
            className="m-0 truncate font-serif text-[22px] font-normal leading-[1.1] text-texte"
            style={{ letterSpacing: '-0.02em' }}
          >
            {title}
          </h3>
          {kicker && (
            <span className="shrink-0 text-[11px] font-bold text-texte-doux">{kicker}</span>
          )}
        </div>
        {action && (
          <button
            type="button"
            onClick={onAction}
            className="flex shrink-0 items-center gap-1 whitespace-nowrap bg-transparent p-0 text-[12px] font-bold text-primary"
          >
            {action}
            <IconArrow size={11} />
          </button>
        )}
      </div>
      {subtitle && (
        <p className="mt-1 text-[12px] font-medium text-texte-doux">{subtitle}</p>
      )}
    </div>
  )
}

/* ─── Aujourd'hui — FeaturedEventCard ────────────────────────────────── */

function FeaturedEventCard({ ev, onClick }: { ev: Evenement; onClick: () => void }) {
  const time = ev.heure ? ev.heure.slice(0, 5) : (ev.date_debut ? dateLabel(ev.date_debut) : '—')
  const kicker = `${categorieKicker(ev.categorie)} · À LA UNE`
  const where = ev.lieux?.nom ?? ev.lieux?.commune ?? '—'
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      style={{ gridColumn: 'span 1', gridRow: 'span 2', borderColor: '#F0EAE0' }}
      className="flex cursor-pointer flex-col overflow-hidden rounded-[16px] border bg-white shadow-[0_2px_10px_rgba(44,28,16,0.06)]"
    >
      <div className="relative h-[128px] bg-bord/40">
        {ev.image_url
          ? <img src={ev.image_url} alt="" className="h-full w-full object-cover" />
          : <div className="h-full w-full bg-gradient-to-br from-[#A85138] to-[#6E2E1E]" />
        }
        <div className="absolute left-2 top-2 rounded-[5px] bg-accent px-2 py-[3px] text-[10px] font-extrabold tracking-[0.08em] text-white">
          {time}
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-between px-3 pb-3.5 pt-3">
        <div>
          <div className="text-[9px] font-extrabold tracking-[0.12em] text-accent">{kicker}</div>
          <div
            className="mt-1 font-serif text-[17px] leading-[1.1] text-texte"
            style={{ letterSpacing: '-0.01em' }}
          >
            {ev.titre}
          </div>
        </div>
        <div className="mt-2 flex items-center gap-1 text-[11px] text-texte-doux">
          <IconPin size={11} />
          <span className="truncate">{where}</span>
        </div>
      </div>
    </div>
  )
}

/* ─── Aujourd'hui — MiniEventCard ────────────────────────────────────── */

function MiniEventCard({ ev, onClick }: { ev: Evenement; onClick: () => void }) {
  const time = ev.heure ? ev.heure.slice(0, 5) : (ev.date_debut ? dateLabel(ev.date_debut) : '—')
  const kicker = categorieKicker(ev.categorie)
  const where = ev.lieux?.nom ?? ev.lieux?.commune ?? '—'
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      style={{ borderColor: '#F0EAE0' }}
      className="flex cursor-pointer overflow-hidden rounded-[14px] border bg-white shadow-[0_1px_4px_rgba(44,28,16,0.04)]"
    >
      <div className="relative w-[64px] shrink-0 bg-bord/40">
        {ev.image_url
          ? <img src={ev.image_url} alt="" className="h-full w-full object-cover" />
          : <div className="h-full w-full bg-gradient-to-br from-[#A8C28E] to-[#5B8A4A]" />
        }
        <div className="absolute bottom-[5px] left-[5px] rounded bg-white/95 px-1.5 py-[2px] text-[9px] font-extrabold text-texte">
          {time}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-[2px] px-2.5 py-2">
        <div className="truncate text-[8px] font-extrabold tracking-[0.12em] text-primary">{kicker}</div>
        <div
          className="line-clamp-2 text-[12px] font-bold leading-[1.15] text-texte"
          style={{ letterSpacing: '-0.01em' }}
        >
          {ev.titre}
        </div>
        <div className="flex items-center gap-1 truncate text-[10px] text-texte-doux">
          <IconPin size={9} />
          <span className="truncate">{where}</span>
        </div>
      </div>
    </div>
  )
}

/* ─── Aujourd'hui — placeholder "+N" si bento incomplet ──────────────── */

function MoreEventsCard({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ borderColor: '#F0EAE0' }}
      className="flex cursor-pointer items-center justify-center overflow-hidden rounded-[14px] border-2 border-dashed bg-cremeDeep text-center"
    >
      <div className="flex flex-col items-center gap-1 px-3 py-4">
        <span className="font-serif text-[20px] leading-none text-primary">+{count}</span>
        <span className="text-[10px] font-bold tracking-[0.06em] text-texte-doux">
          ÉVÉNEMENT{count > 1 ? 'S' : ''}
        </span>
        <span className="text-[10px] font-bold text-primary">Voir tout →</span>
      </div>
    </button>
  )
}

/* ─── Bons plans — CompactPromoCard ──────────────────────────────────── */

function CompactPromoCard({ promo, onClick }: { promo: PromoCard; onClick: () => void }) {
  const photo = promo.display_image_url ?? promo.image_url
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      style={{ borderColor: '#F0EAE0' }}
      className="flex cursor-pointer flex-col overflow-hidden rounded-[14px] border bg-white shadow-[0_1px_4px_rgba(44,28,16,0.04)]"
    >
      <div className="relative h-[78px] bg-bord/40">
        {photo && (
          <img src={photo} alt="" className="h-full w-full object-cover" />
        )}
        <div className="absolute left-1.5 top-1.5 rounded bg-[#E8622A] px-1.5 py-[3px] text-[9px] font-extrabold tracking-[0.08em] text-white">
          BON PLAN
        </div>
      </div>
      <div className="px-2.5 pb-2.5 pt-2">
        <div
          className="line-clamp-2 text-[11px] font-bold leading-[1.2] text-texte"
          style={{ letterSpacing: '-0.01em', minHeight: 26 }}
        >
          {promo.title}
        </div>
        <div className="mt-1 truncate text-[9.5px] text-texte-doux">
          {promo.etablissement?.nom ?? ''}
        </div>
      </div>
    </div>
  )
}

/* ─── Ventes — SaleAnnonceCard ───────────────────────────────────────── */

function SaleAnnonceCard({
  annonce, favored, onToggleFav, onClick,
}: {
  annonce: Annonce
  favored: boolean
  onToggleFav: () => void
  onClick: () => void
}) {
  const photo = annonce.photos?.[0]
  const prixActuel = annonce.prix_actuel
  const prixInitial = annonce.prix_initial
  const showStrike = prixActuel != null && prixInitial != null && prixInitial > prixActuel
  const pct = showStrike
    ? Math.round(100 - (prixActuel! / prixInitial!) * 100)
    : null
  const prixLabel = getPrixAffiche(annonce)
  const villeBlock = annonce.ville ?? '—'
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      style={{ borderColor: '#F0EAE0' }}
      className="flex cursor-pointer flex-col overflow-hidden rounded-[14px] border bg-white shadow-[0_1px_4px_rgba(44,28,16,0.04)]"
    >
      <div className="relative h-[96px] bg-bord/40">
        {photo
          ? <img src={photo} alt="" className="h-full w-full object-cover" />
          : <div className="h-full w-full bg-gradient-to-br from-[#9CB489] to-[#5B8A4A]" />
        }
        {pct !== null && pct > 0 && (
          <div className="absolute left-1.5 top-1.5 rounded bg-[#E03A3A] px-[7px] py-[3px] text-[11px] font-extrabold text-white">
            −{pct}%
          </div>
        )}
        <button
          type="button"
          aria-label={favored ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          onClick={ev => { ev.stopPropagation(); ev.preventDefault(); onToggleFav() }}
          className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-none bg-white/95"
          style={{ color: favored ? '#C84B2F' : '#1A1209' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill={favored ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </button>
      </div>
      <div className="px-2.5 pb-2.5 pt-2">
        <div
          className="truncate text-[12px] font-bold leading-[1.2] text-texte"
          style={{ letterSpacing: '-0.01em' }}
        >
          {annonce.titre}
        </div>
        <div className="mt-[3px] flex items-baseline gap-1.5">
          <span className="font-serif text-[16px] leading-none text-accent">
            {prixLabel}
          </span>
          {showStrike && (
            <span className="text-[11px] text-texte-tres-doux line-through">
              {prixInitial} €
            </span>
          )}
        </div>
        <div className="mt-[3px] truncate text-[10px] text-texte-doux">
          {villeBlock}
        </div>
      </div>
    </div>
  )
}

/* ─── Bottom bento — Carte tile (1.5fr, fond vert) ───────────────────── */

function CarteTile({
  counts, total, onClick,
}: {
  counts: { evt: number; etab: number; prod: number }
  total: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Ouvrir la carte"
      className="flex cursor-pointer flex-col overflow-hidden rounded-[18px] border-none bg-primary p-0 text-left text-white"
      style={{ boxShadow: '0 6px 18px rgba(45,90,61,0.28)' }}
    >
      <div className="relative h-[114px]">
        <svg viewBox="0 0 200 120" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice">
          <rect width="200" height="120" fill="#E4DED2" />
          <path d="M0,80 C50,60 100,90 150,75 C170,68 190,80 200,80 L200,120 L0,120 Z" fill="#B8C89A" opacity="0.55" />
          <ellipse cx="40" cy="40" rx="36" ry="20" fill="#B8C89A" opacity="0.45" />
          <path d="M0,55 C50,48 100,68 150,60 C175,55 195,62 200,62 L200,68 C190,65 175,60 150,65 C100,72 50,55 0,60 Z" fill="#AAC4D8" opacity="0.85" />
          <path d="M-5,45 Q100,30 205,55" stroke="#F8F3EC" strokeWidth="5" fill="none" />
          <path d="M60,-5 Q80,50 100,105" stroke="#F8F3EC" strokeWidth="3.5" fill="none" />
        </svg>
        {[
          { x: 25, y: 35, c: '#E74C3C' },
          { x: 50, y: 50, c: '#2D5A3D', big: true },
          { x: 70, y: 30, c: '#F39C12' },
          { x: 38, y: 65, c: '#3498DB' },
          { x: 78, y: 62, c: '#27AE60' },
          { x: 18, y: 55, c: '#9B59B6' },
        ].map((p, i) => {
          const s = p.big ? 14 : 10
          return (
            <div key={i} style={{ position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%, -100%)' }}>
              <svg width={s} height={s * 1.4} viewBox="0 0 12 17">
                <path d="M6 0 C2.5 0 0 2.5 0 6 C0 11 6 17 6 17 C6 17 12 11 12 6 C12 2.5 9.5 0 6 0z" fill={p.c} stroke="rgba(255,255,255,0.92)" strokeWidth="1" />
              </svg>
            </div>
          )
        })}
        {/* Pastille LIVE */}
        <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-[rgba(26,18,9,0.85)] px-2 py-[3px] text-[9px] font-extrabold tracking-[0.06em] text-white">
          <span
            className="inline-block h-[5px] w-[5px] rounded-full bg-[#5BC85B]"
            style={{ boxShadow: '0 0 0 3px rgba(91,200,91,0.35)' }}
          />
          LIVE
        </span>
      </div>
      <div className="flex items-center justify-between px-3.5 py-3" aria-label={`${total} points sur la carte`}>
        <div>
          <div className="text-[9px] font-extrabold tracking-[0.12em] opacity-85">LE PIVOT</div>
          <div
            className="mt-[3px] font-serif text-[17px] leading-[1.1]"
            style={{ letterSpacing: '-0.01em' }}
          >
            Tout sur la carte
          </div>
          <div className="mt-[3px] text-[10.5px] opacity-75">
            {total} points · {counts.evt} évts · {counts.etab} pros
          </div>
        </div>
        <IconArrow size={20} />
      </div>
    </button>
  )
}

/* ─── Bottom bento — JournalTile (1fr, fond noir) ────────────────────── */

function JournalTile({
  journal, onClick,
}: {
  journal: JournalLite | null
  onClick: () => void
}) {
  const numero = journal?.numero
  const titre = journal?.cover_titre ?? 'Le journal hebdo arrive bientôt'
  const minutes = journal?.temps_lecture_min ?? null
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={numero ? `Journal n°${numero}` : 'Journal — bientôt'}
      className="flex cursor-pointer flex-col overflow-hidden rounded-[18px] border-none p-0 text-left text-creme"
      style={{ background: '#1A1209', boxShadow: '0 6px 18px rgba(26,18,9,0.20)' }}
    >
      <div className="flex h-full flex-col p-3 pt-3.5">
        {numero != null && (
          <div
            className="self-start rounded-lg bg-[#E8C58A] px-[9px] py-[6px] font-serif leading-none text-texte"
            style={{ fontSize: 18, letterSpacing: '-0.01em' }}
          >
            n°{numero}
          </div>
        )}
        {numero == null && (
          <div
            className="self-start rounded-lg bg-[#E8C58A] px-[9px] py-[6px] font-serif leading-none text-texte"
            style={{ fontSize: 18, letterSpacing: '-0.01em' }}
          >
            n°1
          </div>
        )}
        <div className="mt-2.5 text-[9px] font-extrabold tracking-[0.12em] text-[#E8C58A]">
          JOURNAL · HEBDO
        </div>
        <div
          className="mt-1 flex-1 font-serif text-[14px] leading-[1.15]"
          style={{ letterSpacing: '-0.01em' }}
        >
          {numero ? `« ${titre} »` : 'À paraître'}
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[10px] opacity-60">
          {minutes ? `${minutes} min de lecture` : 'Bientôt en kiosque'}
          <IconChevron size={11} />
        </div>
      </div>
    </button>
  )
}

/* ─── Hero carousel (V2 compact) ─────────────────────────────────────── */

function HubHeroCarousel({
  items, onSelect,
}: {
  items: HeroItem[]
  onSelect: (item: HeroItem) => void
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const pausedUntil = useRef<number>(0)
  const scrollEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const tripled = items.length > 1 ? [...items, ...items, ...items] : items
  const loop = items.length > 1

  useEffect(() => {
    if (!loop) return
    const el = scrollerRef.current
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollLeft = items.length * el.clientWidth
    })
  }, [items.length, loop])

  useEffect(() => {
    if (items.length <= 1) return
    const t = setInterval(() => {
      if (Date.now() < pausedUntil.current) return
      const el = scrollerRef.current
      if (!el) return
      const slideW = el.clientWidth
      if (!slideW) return
      const currentIdx = Math.round(el.scrollLeft / slideW)
      el.scrollTo({ left: (currentIdx + 1) * slideW, behavior: 'smooth' })
    }, 5000)
    return () => clearInterval(t)
  }, [items.length])

  function handleScroll() {
    const el = scrollerRef.current
    if (!el) return
    const slideW = el.clientWidth
    if (!slideW) return
    const physicalIdx = Math.round(el.scrollLeft / slideW)
    const wrapped = ((physicalIdx % items.length) + items.length) % items.length
    if (wrapped !== activeIdx) setActiveIdx(wrapped)

    if (loop) {
      if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current)
      scrollEndTimer.current = setTimeout(() => {
        const el2 = scrollerRef.current
        if (!el2) return
        const slideW2 = el2.clientWidth
        const idx2 = Math.round(el2.scrollLeft / slideW2)
        if (idx2 >= items.length * 2) {
          el2.scrollLeft = (idx2 - items.length) * slideW2
        } else if (idx2 < items.length) {
          el2.scrollLeft = (idx2 + items.length) * slideW2
        }
      }, 120)
    }
  }

  function handleInteraction() {
    pausedUntil.current = Date.now() + 8000
  }

  return (
    <div className="px-4 pt-[18px]">
      <div className="relative">
        <div
          ref={scrollerRef}
          onScroll={handleScroll}
          onTouchStart={handleInteraction}
          onMouseDown={handleInteraction}
          onWheel={handleInteraction}
          className="pdv-hscroll flex overflow-x-auto"
          style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}
        >
          {tripled.map((item, idx) => (
            <div
              key={`slide-${idx}`}
              className="min-w-0 shrink-0 grow-0 basis-full snap-start"
            >
              <HeroSlide item={item} onClick={() => onSelect(item)} />
            </div>
          ))}
        </div>

        {/* Dots — top-right */}
        {items.length > 1 && (
          <div className="pointer-events-none absolute right-[22px] top-[14px] flex items-center gap-1">
            {items.map((_, i) => (
              <span
                key={i}
                className={
                  i === activeIdx
                    ? 'h-[4px] w-[14px] rounded-[2px] bg-white'
                    : 'h-[4px] w-[4px] rounded-full bg-white/50'
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function HeroSlide({ item, onClick }: { item: HeroItem; onClick: () => void }) {
  const imagePosition = item.imagePosition ?? '50% 50%'
  if (item.kind === 'evenement') {
    const ev = item.data
    const when = ev.date_debut ? dateLabel(ev.date_debut) : ''
    const cat = ev.categorie ? ev.categorie.toUpperCase() : 'ÉVÉNEMENT'
    const venue = ev.lieux?.nom ? ` · ${ev.lieux.nom.toUpperCase()}` : ''
    return (
      <HeroCardShell
        photo={ev.image_url}
        imagePosition={imagePosition}
        onClick={onClick}
        kicker={`${cat}${venue}`}
        title={ev.titre}
        metaLeft={when ? `${when}${ev.heure ? ` · ${ev.heure}` : ''}` : null}
        metaRight={null}
      />
    )
  }
  if (item.kind === 'etablissement') {
    const etab = item.data
    return (
      <HeroCardShell
        photo={etab.photos?.[0] ?? null}
        imagePosition={imagePosition}
        onClick={onClick}
        kicker="ÉTABLISSEMENT"
        title={etab.nom}
        metaLeft={etab.commune ?? null}
        metaRight={null}
        metaLeftIcon="pin"
      />
    )
  }
  const prod = item.data
  return (
    <HeroCardShell
      photo={prod.photos?.[0] ?? null}
      imagePosition={imagePosition}
      onClick={onClick}
      kicker="PRODUCTEUR LOCAL"
      title={prod.nom}
      metaLeft={prod.commune ?? null}
      metaRight={null}
      metaLeftIcon="pin"
    />
  )
}

function HeroCardShell({
  photo, imagePosition, onClick, kicker, title, metaLeft, metaRight, metaLeftIcon = 'cal',
}: {
  photo: string | null
  imagePosition: string
  onClick: () => void
  kicker: string
  title: string
  metaLeft: string | null
  metaRight: string | null
  metaLeftIcon?: 'cal' | 'pin'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative block h-[180px] w-full appearance-none rounded-tile border-none bg-transparent p-0 text-left"
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <div
        className="absolute inset-0 overflow-hidden rounded-tile bg-primary"
        style={{ transform: 'translateZ(0)' }}
      >
        {photo ? (
          <img
            src={photo}
            alt=""
            className="h-full w-full object-cover"
            style={{ objectPosition: imagePosition }}
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-primary to-[#1A3A2A]" />
        )}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.05) 30%, rgba(0,0,0,0.80) 100%)' }}
        />
      </div>

      <span
        className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-primary-light/95 px-2.5 py-[5px] text-[10px] font-bold tracking-[0.08em] text-primary"
        style={{ backdropFilter: 'blur(4px)' }}
      >
        <IconStar size={11} /> À LA UNE
      </span>
      <div className="absolute bottom-3.5 left-3.5 right-3.5 text-white">
        <div className="text-[10px] font-bold tracking-[0.16em] opacity-90">{kicker}</div>
        <div className="mt-1 font-serif text-[22px] leading-[1.1]">
          {title}
        </div>
        {(metaLeft || metaRight) && (
          <div className="mt-2 flex items-center gap-2.5 text-[11px] text-white/90">
            {metaLeft && (
              <span className="flex items-center gap-1">
                {metaLeftIcon === 'pin' ? <IconPin size={12} /> : <IconCal size={12} />}
                {metaLeft}
              </span>
            )}
            {metaRight && (
              <>
                <span className="opacity-60">·</span>
                <span>{metaRight}</span>
              </>
            )}
          </div>
        )}
      </div>
    </button>
  )
}

/* ─── Icons ──────────────────────────────────────────────────────────── */

const IconPin = ({ size = 11 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    <path d="M12 22s-7-7.5-7-12a7 7 0 0 1 14 0c0 4.5-7 12-7 12z"/>
    <circle cx="12" cy="10" r="2.5"/>
  </svg>
)
const IconCal = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    <rect x="3" y="5" width="18" height="16" rx="2"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
    <line x1="8" y1="3" x2="8" y2="7"/>
    <line x1="16" y1="3" x2="16" y2="7"/>
  </svg>
)
const IconStar = ({ size = 11 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    <polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9"/>
  </svg>
)
const IconArrow = ({ size = 11 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    <line x1="5" y1="12" x2="19" y2="12"/>
    <polyline points="13 6 19 12 13 18"/>
  </svg>
)
const IconChevron = ({ size = 11 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    <polyline points="9 6 15 12 9 18"/>
  </svg>
)
