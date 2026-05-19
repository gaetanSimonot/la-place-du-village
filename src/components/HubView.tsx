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
  const [featuredAnnonces, setFeaturedAnnonces] = useState<Annonce[]>([])
  // Counts globaux pour le bandeau hero map (V3 variant-a2)
  const [zoneCounts, setZoneCounts] = useState<{ evt: number; etab: number; prod: number }>({ evt: 0, etab: 0, prod: 0 })

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

      // 1. Override featured_slots — TOUS les items (events + etabs)
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
        if (ev) items.push({ kind: 'evenement', data: ev, imagePosition: ev.image_position ?? null })
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
        if (ev) items.push({ kind: 'evenement', data: ev, imagePosition: ev.image_position ?? null })
      }

      setHeroItems(items)
  }, [])

  // Events du jour pour "Aujourd'hui" — strict aujourd'hui + count exact
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

  // Promotions actives : featured_slots homepage type=promotion en tête + reste depuis /api/promotions
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

  // Annonces "Les prix baissent" : featured + sponsored + enchères inversées + récentes
  const loadAnnonces = useCallback(async () => {
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

      setFeaturedAnnonces(ordered.slice(0, 10))
  }, [])

  // Premier chargement + refresh sur retour PWA / focus fenêtre
  useEffect(() => {
    loadHero()
    loadToday()
    loadPromos()
    loadAnnonces()
  }, [loadHero, loadToday, loadPromos, loadAnnonces])

  // Realtime — refetch immédiat quand un slot featured change (admin pin / unpin / crop)
  useEffect(() => {
    const ch = supabase
      .channel('hub-featured-slots')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'featured_slots' }, () => {
        loadHero()
        loadPromos()
        loadAnnonces()
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [loadHero, loadPromos, loadAnnonces])

  // Retour en avant-plan / focus fenêtre → refresh complet
  useEffect(() => {
    const refreshAll = () => {
      loadHero()
      loadToday()
      loadPromos()
      loadAnnonces()
    }
    const onVisible = () => { if (document.visibilityState === 'visible') refreshAll() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', refreshAll)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', refreshAll)
    }
  }, [loadHero, loadToday, loadPromos, loadAnnonces])

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
      <HubSearchBar onClick={onOpenSearch} />

      {/* ── 3. Greeting V3 ────────────────────────────────────────────── */}
      <div className="px-4 pt-[18px]">
        <h1
          className="m-0 font-serif text-[24px] leading-[1.1] text-texte"
          style={{ letterSpacing: '-0.01em' }}
        >
          Bonjour, {firstName}
        </h1>
        <p className="mt-1 text-[13px] text-texte-doux">Voici ce qui se passe près de toi.</p>
      </div>

      {/* spacer avant hero map */}
      <div className="h-[14px]" />

      {/* ── 3.5 Hero map bandeau V3 (variant-a2) ─────────────────────────── */}
      <div className="px-4">
        <button
          type="button"
          onClick={() => onSelectAgenda()}
          aria-label="Ouvrir la carte vivante"
          style={{
            width: '100%', padding: 0, border: 'none', cursor: 'pointer',
            position: 'relative', borderRadius: 18, overflow: 'hidden',
            boxShadow: '0 4px 18px rgba(44,28,16,0.14)',
            height: 128, display: 'block',
          }}
        >
          {/* SVG carte stylisé statique */}
          <svg viewBox="0 0 390 200" xmlns="http://www.w3.org/2000/svg"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            preserveAspectRatio="xMidYMid slice"
          >
            <rect width="390" height="200" fill="#E4DED2" />
            <path d="M0,130 C100,90 200,140 300,110 C350,95 380,120 390,118 L390,130 L0,130 Z" fill="#B8C89A" opacity="0.55" />
            <ellipse cx="60" cy="60" rx="55" ry="30" fill="#B8C89A" opacity="0.45" />
            <path d="M0,90 C100,80 200,110 300,100 C350,95 380,105 390,103 L390,108 C380,110 350,100 300,105 C200,115 100,85 0,95 Z" fill="#AAC4D8" opacity="0.85" />
            <path d="M-10,75 Q200,55 400,90" stroke="#F8F3EC" strokeWidth="10" fill="none" />
            <path d="M120,-10 Q160,80 200,170 Q240,250 280,310" stroke="#F8F3EC" strokeWidth="7" fill="none" />
            <path d="M-10,150 L400,140" stroke="#F8F3EC" strokeWidth="4" fill="none" />
            <text x="200" y="100" fill="#8C6E5A" fontSize="9" fontWeight="700" textAnchor="middle" fontFamily="Inter, sans-serif" letterSpacing="0.15em">GANGES</text>
          </svg>
          {/* Pins stylisés */}
          {[
            { x: 30, y: 38, color: '#E74C3C' }, { x: 52, y: 28, color: '#F39C12' },
            { x: 65, y: 55, color: '#E91E63', big: true }, { x: 42, y: 65, color: '#3498DB' },
            { x: 75, y: 42, color: '#27AE60' }, { x: 22, y: 58, color: '#9B59B6' },
            { x: 58, y: 75, color: '#E74C3C' }, { x: 80, y: 68, color: '#F39C12' },
          ].map((p, i) => {
            const size = (p.big ? 14 : 10) * 1.2
            return (
              <svg key={i} width={size} height={size * 1.4} viewBox="0 0 12 17"
                style={{ position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%, -100%)' }}
              >
                <path d="M6 0 C2.5 0 0 2.5 0 6 C0 11 6 17 6 17 C6 17 12 11 12 6 C12 2.5 9.5 0 6 0z" fill={p.color} stroke="rgba(255,255,255,0.92)" strokeWidth="1" />
                <circle cx="6" cy="6" r="2" fill="white" opacity="0.55" />
              </svg>
            )
          })}
          {/* Gradient overlay */}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(26,18,9,0.05) 0%, rgba(26,18,9,0.55) 100%)' }} />
          {/* Chip EN DIRECT top-left */}
          <div style={{ position: 'absolute', top: 10, left: 12, display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(6px)', padding: '4px 9px', borderRadius: 999, fontSize: 9, fontWeight: 800, color: '#2D5A3D', letterSpacing: '0.08em' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#E74C3C', boxShadow: '0 0 0 2.5px rgba(231,76,60,0.30)' }} />
            EN DIRECT
          </div>
          {/* CTA Ouvrir top-right */}
          <div style={{ position: 'absolute', top: 10, right: 12, display: 'flex', alignItems: 'center', gap: 5, background: '#2D5A3D', color: '#fff', padding: '5px 10px 5px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800, boxShadow: '0 2px 8px rgba(45,90,61,0.30)' }}>
            Ouvrir
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" /><polyline points="13 6 19 12 13 18" />
            </svg>
          </div>
          {/* 3 stats glass bottom */}
          <div style={{ position: 'absolute', left: 12, right: 12, bottom: 10, display: 'flex', gap: 6 }}>
            {[
              { n: zoneCounts.evt, l: 'événements' },
              { n: zoneCounts.etab, l: 'commerces' },
              { n: zoneCounts.prod, l: 'producteurs' },
            ].map(s => (
              <div key={s.l} style={{ flex: 1, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', borderRadius: 10, padding: '6px 9px', display: 'flex', alignItems: 'baseline', gap: 5 }}>
                <span style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif', fontSize: 18, color: '#1A1209', lineHeight: 1 }}>{s.n}</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: '#7A6A5A', letterSpacing: '0.02em' }}>{s.l}</span>
              </div>
            ))}
          </div>
        </button>
      </div>

      {/* spacer */}
      <div className="h-[18px]" />

      {/* ── 4. Hero carousel À LA UNE ──────────────────────────────────── */}
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
      <div className="grid grid-cols-6 gap-x-2.5 gap-y-3 px-3 pb-1 pt-6">
        {TILES.map(t => (
          <button
            key={t.id}
            onClick={() => t.click({ onSelectAgenda, onSelectAnnuaire, onSelectProducteurs, onComingSoon, onUpgradePrompt }, router)}
            className="flex flex-col items-center gap-2 bg-transparent p-0"
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
            <span className="text-center text-[11px] font-semibold leading-[1.2] text-texte">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── 6. Aujourd'hui ─────────────────────────────────────────────── */}
      {todayEvents.length > 0 && (
        <>
          <SectionHeaderV3
            title="Aujourd'hui"
            subtitle={`${todayTotal} événement${todayTotal > 1 ? 's' : ''} dans le village`}
            action="Voir tout"
            onAction={onSelectAgendaToday ?? onSelectAgenda}
          />
          <HScrollV3>
            {todayEvents.map(e => (
              <UniformCard
                key={e.id}
                onClick={() => router.push(`/evenement/${e.id}`)}
                photo={e.image_url}
                badge={{
                  text: e.heure ? e.heure.slice(0, 5) : dateLabel(e.date_debut),
                  bg: 'rgba(255,255,255,0.92)',
                  color: '#1A1209',
                }}
                title={e.titre}
                meta={
                  <>
                    <IconPin size={11} />
                    <span className="truncate">{e.lieux?.nom ?? dateLabel(e.date_debut)}</span>
                  </>
                }
                favored={favIds.includes(e.id)}
                onToggleFav={() => toggleFav(e.id)}
              />
            ))}
          </HScrollV3>
        </>
      )}

      {/* ── 7. Bons plans ──────────────────────────────────────────────── */}
      {promos.length > 0 && (
        <>
          <SectionHeaderV3
            title="Bons plans"
            subtitle="Chez vos commerçants partenaires"
            action="Voir tout"
            onAction={() => router.push('/promotions')}
          />
          <HScrollV3>
            {promos.map(p => (
              <UniformCard
                key={p.id}
                onClick={() => router.push(`/promotions?id=${p.id}`)}
                photo={p.display_image_url}
                badge={{ text: 'BON PLAN', bg: '#E8622A', letterSpacing: '0.1em' }}
                title={p.title}
                meta={<span className="truncate">{p.etablissement?.nom ?? ''}</span>}
              />
            ))}
          </HScrollV3>
        </>
      )}

      {/* ── 8. Les prix baissent ───────────────────────────────────────── */}
      {featuredAnnonces.length > 0 && (
        <>
          <SectionHeaderV3
            title="Les prix baissent"
            subtitle="Annonces en baisse cette semaine"
            action="Annonces"
            onAction={() => router.push('/annonces')}
          />
          <HScrollV3>
            {featuredAnnonces.map(a => (
              <DiscountUniformCard key={a.id} annonce={a} />
            ))}
          </HScrollV3>
        </>
      )}
    </div>
  )
}

/* ─── Sub-components V3 ─────────────────────────────────────────────── */

function HScrollV3({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="pdv-hscroll flex gap-2.5 overflow-x-auto pb-1 pl-4 pr-0"
      style={{ scrollSnapType: 'x mandatory' }}
    >
      {children}
      {/* Spacer fin de carousel pour respiration */}
      <div className="w-4 shrink-0" aria-hidden />
    </div>
  )
}

function SectionHeaderV3({
  title, subtitle, action, onAction,
}: {
  title: string
  subtitle?: string
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="px-4 pb-[14px] pt-7">
      <div className="flex items-baseline justify-between gap-2.5">
        <h3
          className="m-0 min-w-0 truncate font-serif text-[22px] font-normal leading-[1.1] text-texte"
          style={{ letterSpacing: '-0.02em' }}
        >
          {title}
        </h3>
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
      {subtitle && (
        <p className="mt-1 text-[12px] font-medium text-texte-doux">{subtitle}</p>
      )}
    </div>
  )
}

interface BadgeSpec {
  text: string
  bg: string
  color?: string
  fontSize?: number
  letterSpacing?: string
  icon?: React.ReactNode
}

function UniformCard({
  onClick, photo, badge, title, meta, favored, onToggleFav,
}: {
  onClick?:     () => void
  photo:        string | null | undefined
  badge?:       BadgeSpec
  title:        string
  meta:         React.ReactNode
  favored?:     boolean
  onToggleFav?: () => void
}) {
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.() } }}
      className="flex w-[150px] shrink-0 cursor-pointer snap-start flex-col overflow-hidden rounded-card border bg-white shadow-[0_1px_4px_rgba(44,28,16,0.04)]"
      style={{ borderColor: '#F0EAE0' }}
    >
      <div className="relative h-[100px] bg-bord/40">
        {photo && (
          <img src={photo} alt="" className="h-full w-full object-cover" />
        )}
        {badge && (
          <span
            className="absolute left-2 top-2 inline-flex items-center gap-[3px] rounded-[5px] px-[7px] py-1 font-extrabold"
            style={{
              backgroundColor: badge.bg,
              color: badge.color ?? '#fff',
              fontSize: badge.fontSize ?? 10,
              letterSpacing: badge.letterSpacing ?? '0.06em',
            }}
          >
            {badge.icon}{badge.text}
          </span>
        )}
        {onToggleFav && (
          <button
            type="button"
            aria-label={favored ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            aria-pressed={!!favored}
            className="absolute right-2 top-2 flex h-[26px] w-[26px] items-center justify-center rounded-full border-none bg-white/90"
            onClick={ev => { ev.stopPropagation(); ev.preventDefault(); onToggleFav() }}
            style={{ color: favored ? '#C84B2F' : '#1A1209' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill={favored ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          </button>
        )}
      </div>
      <div className="px-[11px] pb-[11px] pt-[9px]">
        <div
          className="line-clamp-2 text-[13px] font-bold leading-[1.25] text-texte"
          style={{ letterSpacing: '-0.01em', minHeight: 33 }}
        >
          {title}
        </div>
        <div className="mt-1 flex items-center gap-1 overflow-hidden whitespace-nowrap text-[11px] text-texte-doux">
          {meta}
        </div>
      </div>
    </div>
  )
}

function DiscountUniformCard({ annonce }: { annonce: Annonce }) {
  const router = useRouter()
  const photo = annonce.photos?.[0]
  const prix = getPrixAffiche(annonce)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prixInitial = (annonce as any).prix_initial as number | null | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prixVal = (annonce as any).prix as number | null | undefined
  const showOld = typeof prixInitial === 'number' && typeof prixVal === 'number' && prixInitial > prixVal
  const pct = showOld ? Math.round(100 - (prixVal! / prixInitial!) * 100) : null

  const badge: BadgeSpec | undefined =
    pct !== null
      ? { text: `-${pct}%`, bg: '#E03A3A', fontSize: 11 }
      : annonce.type === 'enchere_inversee'
        ? { text: 'ENCHÈRE', bg: '#E03A3A', letterSpacing: '0.04em' }
        : undefined

  return (
    <UniformCard
      onClick={() => router.push(`/annonces/${annonce.id}`)}
      photo={photo}
      badge={badge}
      title={annonce.titre}
      meta={
        <>
          <span className="font-extrabold text-accent">{prix}</span>
          {showOld && (
            <span className="text-texte-tres-doux line-through">{prixInitial} €</span>
          )}
        </>
      }
    />
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
      {/* Couche visuelle : photo + gradient, explicitement clippée à la
          forme arrondie (workaround iOS Safari sur button + overflow-hidden) */}
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

/* ─── Icons (hero + cards) ───────────────────────────────────────────── */

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
