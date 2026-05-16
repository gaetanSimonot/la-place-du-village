'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { EtablissementType, Evenement } from '@/lib/types'
import { getPrixAffiche, type Annonce } from '@/lib/annonces'
import HubTopBar from '@/components/HubTopBar'
import HubSearchBar from '@/components/HubSearchBar'
import HubSearchModal from '@/components/HubSearchModal'

interface Props {
  onSelectAgenda:        () => void
  onSelectAnnuaire:      (typeFilter?: EtablissementType) => void
  onSelectProducteurs:   () => void
  onComingSoon:          (label: string) => void
  onUpgradePrompt:       (requiredPlan: 'habitants' | 'pro', label: string) => void
  onOpenNotifs?:         () => void
  onOpenInfo?:           () => void
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
  | { kind: 'evenement';     data: Evenement }
  | { kind: 'etablissement'; data: HeroEtab }
  | { kind: 'producteur';    data: HeroProducteur }

const TILES: { id: string; label: string; iconSrc: string; click: (p: Props, router: ReturnType<typeof useRouter>) => void }[] = [
  { id: 'agenda',      label: 'Agenda',      iconSrc: '/icones-rondes/01_agenda_culturel.png',         click: p => p.onSelectAgenda() },
  { id: 'annuaire',    label: 'Annuaire',    iconSrc: '/icones-rondes/02_annuaire_professionnel.png',  click: p => p.onSelectAnnuaire() },
  { id: 'producteurs', label: 'Producteurs', iconSrc: '/icones-rondes/05_producteurs_vente_libre.png', click: p => p.onSelectProducteurs() },
  { id: 'restos',      label: 'Restos',      iconSrc: '/icones-rondes/03_restos_bars.png',             click: p => p.onSelectAnnuaire('restaurant_bar') },
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

export default function HubView({
  onSelectAgenda, onSelectAnnuaire, onSelectProducteurs,
  onComingSoon, onUpgradePrompt,
  onOpenNotifs, onOpenInfo, unreadCount = 0,
}: Props) {
  const router = useRouter()
  const { profile } = useAuth()

  const [heroItems, setHeroItems] = useState<HeroItem[]>([])
  const [todayEvents, setTodayEvents] = useState<Evenement[]>([])
  const [promos, setPromos] = useState<PromoCard[]>([])
  const [featuredAnnonces, setFeaturedAnnonces] = useState<Annonce[]>([])
  const [searchOpen, setSearchOpen] = useState(false)

  // Hero carousel : 1. featured_slots hub_hero (events + etabs) > 2. today event > 3. week event
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const todayISO = new Date().toISOString().slice(0, 10)
      const inAWeek = new Date(); inAWeek.setDate(inAWeek.getDate() + 7)
      const weekISO = inAWeek.toISOString().slice(0, 10)
      const nowISO  = new Date().toISOString()

      // 1. Override featured_slots — TOUS les items (events + etabs)
      const { data: featuredSlots } = await supabase
        .from('featured_slots')
        .select('content_type, content_id, priority')
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
          if (s.content_type === 'evenement' && evMap[s.content_id]) {
            items.push({ kind: 'evenement', data: evMap[s.content_id] })
          } else if (s.content_type === 'etablissement' && etabMap[s.content_id]) {
            items.push({ kind: 'etablissement', data: etabMap[s.content_id] })
          } else if (s.content_type === 'producteur' && prodMap[s.content_id]) {
            items.push({ kind: 'producteur', data: prodMap[s.content_id] })
          }
        })
      }

      // 2. Fallback : event du jour
      if (items.length === 0) {
        const r = await supabase
          .from('evenements')
          .select('*, lieux(*)')
          .eq('statut', 'publie')
          .eq('date_debut', todayISO)
          .order('promo_ordre', { ascending: false })
          .limit(1)
        const ev = (r.data?.[0] as Evenement | undefined) ?? null
        if (ev) items.push({ kind: 'evenement', data: ev })
      }

      // 3. Fallback : event de la semaine
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
        if (ev) items.push({ kind: 'evenement', data: ev })
      }

      if (mounted) setHeroItems(items)
    })()
    return () => { mounted = false }
  }, [])

  // Events du jour pour "Aujourd'hui dans le village"
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const today = new Date().toISOString().slice(0, 10)
      const { data } = await supabase
        .from('evenements')
        .select('*, lieux(*)')
        .eq('statut', 'publie')
        .or(`date_debut.eq.${today},date_debut.gte.${today}`)
        .order('date_debut', { ascending: true })
        .limit(8)
      if (mounted) setTodayEvents((data ?? []) as Evenement[])
    })()
    return () => { mounted = false }
  }, [])

  // Promotions actives : featured_slots homepage type=promotion en tête + reste depuis /api/promotions
  useEffect(() => {
    let mounted = true
    ;(async () => {
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

      if (mounted) setPromos(ordered.slice(0, 8))
    })()
    return () => { mounted = false }
  }, [])

  // Annonces "Les prix baissent" : featured + sponsored + enchères inversées + récentes
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const nowISO = new Date().toISOString()
      const ordered: Annonce[] = []
      const seen = new Set<string>()

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

      const { data: sponsoredRows } = await supabase
        .from('annonces')
        .select('*')
        .eq('statut', 'active')
        .eq('sponsored', true)
        .order('updated_at', { ascending: false })
        .limit(8)
      ;((sponsoredRows ?? []) as Annonce[]).forEach(a => {
        if (!seen.has(a.id)) { ordered.push(a); seen.add(a.id) }
      })

      const { data: encheres } = await supabase
        .from('annonces')
        .select('*')
        .eq('statut', 'active')
        .eq('type', 'enchere_inversee')
        .order('created_at', { ascending: false })
        .limit(8)
      ;((encheres ?? []) as Annonce[]).forEach(a => {
        if (!seen.has(a.id)) { ordered.push(a); seen.add(a.id) }
      })

      if (ordered.length < 6) {
        const { data: recent } = await supabase
          .from('annonces')
          .select('*')
          .eq('statut', 'active')
          .order('created_at', { ascending: false })
          .limit(10)
        ;((recent ?? []) as Annonce[]).forEach(a => {
          if (!seen.has(a.id)) { ordered.push(a); seen.add(a.id) }
        })
      }

      if (mounted) setFeaturedAnnonces(ordered.slice(0, 10))
    })()
    return () => { mounted = false }
  }, [])

  const firstName = profile?.display_name?.split(' ')[0] || 'Visiteur'

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

      {/* ── 2. Search bar (ouvre la modale recherche globale) ─────────── */}
      <HubSearchBar onClick={() => setSearchOpen(true)} />

      {/* ── 3. Greeting line ──────────────────────────────────────────── */}
      <div className="px-4 pb-1.5 pt-3.5">
        <p className="m-0 text-[13px] text-texte-doux">
          <span className="font-bold text-texte">Bonjour {firstName}.</span>
          {' '}Voici ce qui se passe.
        </p>
      </div>

      <HubSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* ── 4. Hero carousel ──────────────────────────────────────────── */}
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

      {/* ── 5. Tiles 6 colonnes ────────────────────────────────────────── */}
      <div className="grid grid-cols-6 gap-1.5 px-3 pb-1 pt-4">
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

      {/* ── 6. Aujourd'hui ─────────────────────────────────────────────── */}
      {todayEvents.length > 0 && (
        <>
          <SectionHeader
            icon={<IconCalendar />}
            title="Aujourd'hui"
            count={todayEvents.length}
            action="Voir tout"
            onAction={onSelectAgenda}
          />
          <HScroll>
            {todayEvents.map(e => (
              <Link
                key={e.id}
                href={`/evenement/${e.id}`}
                className="flex w-[260px] shrink-0 snap-start items-center gap-2.5 rounded-[14px] border border-bord bg-white p-2.5 no-underline"
              >
                <div
                  className="flex h-[60px] w-[60px] shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-bord/40"
                >
                  {e.image_url ? (
                    <img src={e.image_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <IconCalendar size={22} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-1 text-[13px] font-bold leading-[1.25] text-texte">
                    {e.titre}
                  </div>
                  {e.lieux?.nom && (
                    <div className="mt-[3px] flex items-center gap-[3px] overflow-hidden text-[11px] text-texte-doux">
                      <IconPin size={11} />
                      <span className="truncate">{e.lieux.nom}</span>
                    </div>
                  )}
                  <div className="mt-[3px] text-[11px] font-bold text-primary">
                    {dateLabel(e.date_debut)}{e.heure ? ` · ${e.heure}` : ''}
                  </div>
                </div>
              </Link>
            ))}
          </HScroll>
        </>
      )}

      {/* ── 7. Bons plans ──────────────────────────────────────────────── */}
      {promos.length > 0 && (
        <>
          <SectionHeader
            icon={<IconGift />}
            title="Bons plans"
            count={promos.length}
            action="Voir tout"
            onAction={() => router.push('/promotions')}
          />
          <HScroll>
            {promos.map(p => (
              <Link
                key={p.id}
                href={`/promotions?id=${p.id}`}
                className="block w-[170px] shrink-0 snap-start overflow-hidden rounded-[14px] border border-bord bg-white no-underline"
              >
                <div className="relative h-[110px] bg-bord/40">
                  {p.display_image_url && (
                    <img src={p.display_image_url} alt="" className="h-full w-full object-cover" />
                  )}
                  <span className="absolute left-2 top-2 rounded-[5px] bg-[#E8622A] px-[7px] py-1 text-[9px] font-extrabold tracking-[0.1em] text-white">
                    BON PLAN
                  </span>
                  <button
                    type="button"
                    aria-label="Favori"
                    className="absolute right-2 top-2 flex h-[26px] w-[26px] items-center justify-center rounded-full border-none bg-white/90"
                    onClick={(ev) => { ev.preventDefault() }}
                  >
                    <IconHeart size={14} />
                  </button>
                </div>
                <div className="px-2.5 pb-2.5 pt-2">
                  <div className="line-clamp-1 text-[13px] font-bold leading-[1.2] text-texte">{p.title}</div>
                  {p.etablissement?.nom && (
                    <div className="mt-0.5 truncate text-[11px] text-texte-doux">{p.etablissement.nom}</div>
                  )}
                </div>
              </Link>
            ))}
          </HScroll>
        </>
      )}

      {/* ── 8. Les prix baissent ───────────────────────────────────────── */}
      {featuredAnnonces.length > 0 && (
        <>
          <SectionHeader
            icon={<IconTrendDown />}
            title="Les prix baissent"
            action="Annonces"
            onAction={() => router.push('/annonces')}
          />
          <HScroll>
            {featuredAnnonces.map(a => (
              <DiscountCard key={a.id} annonce={a} />
            ))}
          </HScroll>
        </>
      )}
    </div>
  )
}

/* ─── Sub-components ─────────────────────────────────────────────────── */

function HScroll({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="pdv-hscroll flex gap-2.5 overflow-x-auto px-4 pb-1"
      style={{ scrollSnapType: 'x mandatory' }}
    >
      {children}
    </div>
  )
}

function SectionHeader({
  icon, title, count, action = 'Voir tout', onAction,
}: {
  icon?: React.ReactNode
  title: string
  count?: number
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-2.5 px-4 pb-2 pt-[18px]">
      <div className="flex min-w-0 items-center gap-2">
        {icon && <span className="inline-flex shrink-0 text-primary">{icon}</span>}
        <h3 className="m-0 truncate text-[15px] font-extrabold leading-[1.2] tracking-tight2 text-texte">
          {title}
        </h3>
        {count != null && (
          <span className="rounded-full bg-bord/40 px-[7px] py-0.5 text-[11px] font-bold text-texte-doux">
            {count}
          </span>
        )}
      </div>
      {action && (
        <button
          type="button"
          onClick={onAction}
          className="shrink-0 whitespace-nowrap bg-transparent p-0 text-[12px] font-bold text-primary"
        >
          {action} →
        </button>
      )}
    </div>
  )
}

function DiscountCard({ annonce }: { annonce: Annonce }) {
  const photo = annonce.photos?.[0]
  const prix = getPrixAffiche(annonce)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prixInitial = (annonce as any).prix_initial as number | null | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prixVal = (annonce as any).prix as number | null | undefined
  const showOld = typeof prixInitial === 'number' && typeof prixVal === 'number' && prixInitial > prixVal
  const pct = showOld ? Math.round(100 - (prixVal! / prixInitial!) * 100) : null

  return (
    <Link
      href={`/annonces/${annonce.id}`}
      className="block w-[140px] shrink-0 snap-start overflow-hidden rounded-[14px] border border-bord bg-white no-underline"
    >
      <div className="relative h-[110px] bg-bord/40">
        {photo ? (
          <img src={photo} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-texte-tres-doux">
            <IconTag size={22} />
          </div>
        )}
        {pct !== null && (
          <span className="absolute left-2 top-2 rounded-[5px] bg-[#E03A3A] px-[7px] py-[3px] text-[10px] font-extrabold text-white">
            -{pct}%
          </span>
        )}
        {annonce.type === 'enchere_inversee' && pct === null && (
          <span className="absolute left-2 top-2 rounded-[5px] bg-[#E03A3A] px-[7px] py-[3px] text-[10px] font-extrabold tracking-[0.04em] text-white">
            ENCHÈRE
          </span>
        )}
      </div>
      <div className="px-2.5 pb-2.5 pt-2">
        <div className="line-clamp-1 text-[13px] font-bold leading-[1.25] text-texte">{annonce.titre}</div>
        <div className="mt-0.5 flex items-baseline gap-1.5">
          <span className="text-[13px] font-extrabold text-accent">{prix}</span>
          {showOld && (
            <span className="text-[11px] text-texte-tres-doux line-through">
              {prixInitial} €
            </span>
          )}
        </div>
      </div>
    </Link>
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
    <div className="px-4 pt-2.5">
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
  if (item.kind === 'evenement') {
    const ev = item.data
    const when = ev.date_debut ? dateLabel(ev.date_debut) : ''
    const cat = ev.categorie ? ev.categorie.toUpperCase() : 'ÉVÉNEMENT'
    const venue = ev.lieux?.nom ? ` · ${ev.lieux.nom.toUpperCase()}` : ''
    return (
      <HeroCardShell
        photo={ev.image_url}
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
  photo, onClick, kicker, title, metaLeft, metaRight, metaLeftIcon = 'cal',
}: {
  photo: string | null
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
      className="relative block h-[180px] w-full overflow-hidden rounded-tile border-none bg-primary p-0 text-left shadow-hero"
    >
      {photo ? (
        <img src={photo} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full bg-gradient-to-br from-primary to-[#1A3A2A]" />
      )}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.05) 30%, rgba(0,0,0,0.80) 100%)' }}
      />
      {/* Badge À LA UNE */}
      <span
        className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-primary-light/95 px-2.5 py-[5px] text-[10px] font-bold tracking-[0.08em] text-primary"
        style={{ backdropFilter: 'blur(4px)' }}
      >
        <IconStar size={11} /> À LA UNE
      </span>
      {/* Bottom content */}
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

/* ─── Icons (sections + hero) ────────────────────────────────────────── */

const IconCalendar = ({ size = 17 }: { size?: number } = {}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
)
const IconGift = ({ size = 17 }: { size?: number } = {}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 12 20 22 4 22 4 12"/>
    <rect x="2" y="7" width="20" height="5"/>
    <line x1="12" y1="22" x2="12" y2="7"/>
    <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
    <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
  </svg>
)
const IconTrendDown = ({ size = 17 }: { size?: number } = {}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/>
    <polyline points="16 17 22 17 22 11"/>
  </svg>
)
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
const IconHeart = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-texte">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>
)
const IconTag = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.59 13.41L13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
    <line x1="7" y1="7" x2="7.01" y2="7"/>
  </svg>
)
