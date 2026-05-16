'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import type { EtablissementType, Evenement } from '@/lib/types'
import { getPrixAffiche, getNextDropDate, formatCountdown, type Annonce } from '@/lib/annonces'

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

type HeroItem =
  | { kind: 'evenement';     data: Evenement }
  | { kind: 'etablissement'; data: HeroEtab }

const TILES: { id: string; label: string; sublabel: string; icon: string; color: string; bg: string; click: (p: Props, router: ReturnType<typeof useRouter>) => void }[] = [
  { id: 'agenda',      label: 'Agenda',      sublabel: 'culturel',      icon: '📅', color: '#2D5A3D', bg: '#E8F2EB', click: p => p.onSelectAgenda() },
  { id: 'annuaire',    label: 'Annuaire',    sublabel: 'pro',           icon: '🏪', color: '#3A5BC7', bg: '#EEF3FF', click: p => p.onSelectAnnuaire() },
  { id: 'producteurs', label: 'Producteurs', sublabel: 'vente libre',   icon: '🌱', color: '#2D5A3D', bg: '#E8F2EB', click: p => p.onSelectProducteurs() },
  { id: 'restos',      label: 'Restos',      sublabel: '& bars',        icon: '🍴', color: '#E8622A', bg: '#FFF0EB', click: p => p.onSelectAnnuaire('restaurant_bar') },
  { id: 'annonces',    label: 'Annonces',    sublabel: 'locales',       icon: '🏷️', color: '#C0392B', bg: '#FBE9E7', click: (_, r) => r.push('/annonces') },
]

const CATEGORIE_META: Record<string, { icon: string; label: string }> = {
  concert:  { icon: '🎵', label: 'Concert' },
  theatre:  { icon: '🎭', label: 'Théâtre' },
  sport:    { icon: '⚽', label: 'Sport' },
  marche:   { icon: '🌾', label: 'Marché' },
  atelier:  { icon: '🛠️', label: 'Atelier' },
  fete:     { icon: '🎉', label: 'Fête' },
  autre:    { icon: '✨', label: 'Événement' },
}

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
  const [featuredAnnonce, setFeaturedAnnonce] = useState<Annonce | null>(null)
  const [subtitle, setSubtitle] = useState<string>('Tout le village, à portée de main')

  // Sous-titre éditable par l'admin (config.hub_subtitle)
  useEffect(() => {
    supabase.from('config').select('value').eq('key', 'hub_subtitle').maybeSingle()
      .then(({ data }) => { if (data?.value) setSubtitle(data.value) })
  }, [])

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

        const [evRes, etabRes] = await Promise.all([
          evIds.length > 0
            ? supabase.from('evenements').select('*, lieux(*)').in('id', evIds).eq('statut', 'publie')
            : Promise.resolve({ data: [] }),
          etabIds.length > 0
            ? supabase.from('etablissements').select('id, nom, commune, photos, type').in('id', etabIds)
            : Promise.resolve({ data: [] }),
        ])

        const evMap   = Object.fromEntries(((evRes.data ?? []) as Evenement[]).map(e => [e.id, e]))
        const etabMap = Object.fromEntries(((etabRes.data ?? []) as HeroEtab[]).map(e => [e.id, e]))

        // Re-merge dans l'ordre priority des slots
        featuredSlots.forEach(s => {
          if (s.content_type === 'evenement' && evMap[s.content_id]) {
            items.push({ kind: 'evenement', data: evMap[s.content_id] })
          } else if (s.content_type === 'etablissement' && etabMap[s.content_id]) {
            items.push({ kind: 'etablissement', data: etabMap[s.content_id] })
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
        .limit(5)
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

      // 1. Featured slots
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

      // 2. Toutes les promos depuis /api/promotions
      const r = await fetch('/api/promotions').catch(() => null)
      const allPromos: PromoCard[] = r && r.ok ? ((await r.json())?.promotions ?? []) : []

      // 3. Mettre les featured en tête
      featuredContentIds.forEach(id => {
        const p = allPromos.find(x => x.id === id)
        if (p) ordered.push(p)
      })
      // 4. Compléter avec le reste
      allPromos.forEach(p => { if (!featuredIds.has(p.id)) ordered.push(p) })

      if (mounted) setPromos(ordered.slice(0, 6))
    })()
    return () => { mounted = false }
  }, [])

  // Annonce vedette : 1. featured_slots homepage (override) > 2. sponsored > 3. enchère récente
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const nowISO = new Date().toISOString()
      let data: Annonce | null = null

      // 1. Override featured_slots homepage type annonce
      const { data: featuredSlots } = await supabase
        .from('featured_slots')
        .select('content_id')
        .eq('slot', 'homepage')
        .eq('content_type', 'annonce')
        .lte('starts_at', nowISO)
        .gt('ends_at', nowISO)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)

      if (featuredSlots && featuredSlots.length > 0) {
        const { data: a } = await supabase
          .from('annonces')
          .select('*')
          .eq('id', featuredSlots[0].content_id)
          .eq('statut', 'active')
          .maybeSingle()
        data = a as Annonce | null
      }

      // 2. Fallback sponsored
      if (!data) {
        const r = await supabase
          .from('annonces')
          .select('*')
          .eq('statut', 'active')
          .eq('sponsored', true)
          .order('updated_at', { ascending: false })
          .limit(1)
        data = (r.data?.[0] as Annonce | undefined) ?? null
      }

      // 3. Fallback enchère récente
      if (!data) {
        const r = await supabase
          .from('annonces')
          .select('*')
          .eq('statut', 'active')
          .eq('type', 'enchere_inversee')
          .order('created_at', { ascending: false })
          .limit(1)
        data = (r.data?.[0] as Annonce | undefined) ?? null
      }

      if (mounted) setFeaturedAnnonce(data)
    })()
    return () => { mounted = false }
  }, [])

  return (
    <div style={{
      minHeight: '100%',
      backgroundColor: '#F2EBE0',
      fontFamily: 'Inter, sans-serif',
      paddingBottom: 24,
    }}>
      <style>{`
        .pdv-hscroll { scrollbar-width: none; -webkit-overflow-scrolling: touch; }
        .pdv-hscroll::-webkit-scrollbar { display: none; }
      `}</style>

      {/* ── 1. Header ─────────────────────────────────────────────────────── */}
      <div style={{ padding: '20px 18px 10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <Link
            href={profile ? `/profil/${profile.id ?? ''}` : '/?tab=profil'}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              textDecoration: 'none', color: 'inherit',
              flex: '0 1 auto', minWidth: 0,
            }}
          >
            <div style={{
              width: 38, height: 38, borderRadius: '50%',
              backgroundColor: '#2D5A3D', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 15, fontWeight: 800,
              backgroundImage: profile?.avatar_url ? `url(${profile.avatar_url})` : undefined,
              backgroundSize: 'cover', backgroundPosition: 'center',
              flexShrink: 0,
              boxShadow: '0 1px 3px rgba(0,0,0,0.10)',
            }}>
              {!profile?.avatar_url && ((profile?.display_name?.[0] || '?').toUpperCase())}
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: '#8A7A6A', lineHeight: 1.1 }}>
                Bonjour 👋
              </p>
              <p style={{
                margin: '1px 0 0', fontSize: 14, fontWeight: 800,
                color: '#1A1209', lineHeight: 1.15,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {profile?.display_name || 'visiteur'}
              </p>
            </div>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {onOpenInfo && (
              <button
                onClick={onOpenInfo}
                aria-label="À propos de l'app"
                style={{
                  width: 42, height: 42, borderRadius: 14,
                  backgroundColor: '#fff', border: '1px solid #E5DDD2',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                  fontSize: 17, fontWeight: 900, color: '#2D5A3D',
                  fontFamily: 'Lora, serif', fontStyle: 'italic',
                }}
              >i</button>
            )}
            {onOpenNotifs && (
              <button
                onClick={onOpenNotifs}
                aria-label="Notifications"
                style={{
                  position: 'relative', width: 42, height: 42, borderRadius: 14,
                  backgroundColor: '#fff', border: '1px solid #E5DDD2',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2D5A3D" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                {unreadCount > 0 && (
                  <span style={{
                    position: 'absolute', top: -5, right: -5,
                    minWidth: 18, height: 18, borderRadius: 9,
                    backgroundColor: '#E53935', color: '#fff',
                    fontSize: 10, fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 4px', fontFamily: 'Inter, sans-serif',
                    border: '1.5px solid #fff',
                  }}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>

        <h1 style={{
          fontSize: 30, fontWeight: 900, letterSpacing: '-0.03em',
          color: '#1A1209', margin: '14px 0 4px',
          lineHeight: 1.05,
        }}>
          La Place du Village
        </h1>
        <p style={{
          margin: 0, fontSize: 13, color: '#7A6A5A',
          fontFamily: 'Lora, serif', fontStyle: 'italic',
        }}>
          {subtitle}
        </p>
      </div>

      {/* ── 2. Hero carousel (events + établissements featured) ──────────── */}
      {heroItems.length > 0 && (
        <HubHeroCarousel
          items={heroItems}
          onSelect={item => {
            if (item.kind === 'evenement') router.push(`/evenement/${item.data.id}`)
            else                            router.push(`/etablissement/${item.data.id}`)
          }}
        />
      )}

      {/* ── 3. Tuiles accès rapide ────────────────────────────────────────── */}
      <div style={{ padding: '16px 14px 4px' }}>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }} className="pdv-hscroll">
          {TILES.map(t => (
            <button
              key={t.id}
              onClick={() => t.click({ onSelectAgenda, onSelectAnnuaire, onSelectProducteurs, onComingSoon, onUpgradePrompt }, router)}
              style={{
                flex: '0 0 auto',
                width: 86,
                padding: '12px 8px 10px',
                borderRadius: 16, border: 'none',
                backgroundColor: '#fff',
                boxShadow: '0 1px 6px rgba(44,28,16,0.06)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                backgroundColor: t.bg, color: t.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20,
              }}>{t.icon}</div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: '#1A1209', lineHeight: 1.15 }}>{t.label}</p>
                <p style={{ margin: '1px 0 0', fontSize: 10, color: '#8A7A6A', lineHeight: 1.15 }}>{t.sublabel}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── 4. Aujourd'hui dans le village ────────────────────────────────── */}
      {todayEvents.length > 0 && (
        <SectionHeader title="Aujourd'hui dans le village" cta="Voir tout" onCta={onSelectAgenda} />
      )}
      {todayEvents.length > 0 && (
        <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {todayEvents.slice(0, 3).map(e => (
            <Link
              key={e.id}
              href={`/evenement/${e.id}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: 10, borderRadius: 14,
                backgroundColor: '#fff', boxShadow: '0 1px 6px rgba(44,28,16,0.05)',
                textDecoration: 'none', color: 'inherit',
              }}
            >
              <div style={{
                width: 52, height: 52, flexShrink: 0,
                borderRadius: 10, overflow: 'hidden',
                backgroundColor: '#F0EBE3',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22,
              }}>
                {e.image_url
                  ? <img src={e.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : '🎉'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#1A1209', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.titre}</p>
                {e.lieux?.nom && <p style={{ margin: 0, fontSize: 12, color: '#8A7A6A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📍 {e.lieux.nom}</p>}
                <p style={{ margin: '2px 0 0', fontSize: 11, color: '#2D5A3D', fontWeight: 700 }}>{dateLabel(e.date_debut)}{e.heure && ` · ${e.heure}`}</p>
              </div>
              <span style={{ color: '#C8B8A8', fontSize: 18 }}>›</span>
            </Link>
          ))}
        </div>
      )}

      {/* ── 5. Bons plans (promotions) ────────────────────────────────────── */}
      {promos.length > 0 && (
        <>
          <SectionHeader title="🎁 Bons plans autour de vous" cta="Voir tout" onCta={() => router.push('/promotions')} />
          <div style={{ overflowX: 'auto', padding: '0 14px 4px' }} className="pdv-hscroll">
            <div style={{ display: 'flex', gap: 10 }}>
              {promos.map(p => (
                <Link
                  key={p.id}
                  href={`/promotions?id=${p.id}`}
                  style={{
                    flex: '0 0 156px',
                    borderRadius: 14, overflow: 'hidden',
                    backgroundColor: '#fff', boxShadow: '0 1px 6px rgba(44,28,16,0.05)',
                    textDecoration: 'none', color: 'inherit',
                  }}
                >
                  <div style={{
                    height: 92, backgroundColor: '#F0EBE3',
                    backgroundImage: p.display_image_url ? `url(${p.display_image_url})` : undefined,
                    backgroundSize: 'cover', backgroundPosition: 'center',
                    position: 'relative',
                  }}>
                    <span style={{
                      position: 'absolute', top: 6, left: 6,
                      backgroundColor: '#E8622A', color: '#fff',
                      fontSize: 10, fontWeight: 800,
                      padding: '3px 8px', borderRadius: 999,
                    }}>BON PLAN</span>
                  </div>
                  <div style={{ padding: 10 }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: '#1A1209', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</p>
                    {p.etablissement?.nom && <p style={{ margin: '2px 0 0', fontSize: 11, color: '#8A7A6A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.etablissement.nom}</p>}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── 6. Annonce vedette / Enchère ──────────────────────────────────── */}
      {featuredAnnonce && (
        <>
          <SectionHeader title="📉 Les prix baissent" cta="Voir les annonces" onCta={() => router.push('/annonces')} />
          <div style={{ padding: '0 14px' }}>
            <Link
              href={`/annonces/${featuredAnnonce.id}`}
              style={{
                display: 'flex', gap: 12, alignItems: 'center',
                padding: 12, borderRadius: 16,
                backgroundColor: '#fff', boxShadow: '0 1px 6px rgba(44,28,16,0.06)',
                textDecoration: 'none', color: 'inherit',
              }}
            >
              <div style={{
                width: 84, height: 84, flexShrink: 0,
                borderRadius: 12, overflow: 'hidden',
                backgroundColor: '#F0EBE3',
              }}>
                {featuredAnnonce.photos[0] ? (
                  <img src={featuredAnnonce.photos[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🏷️</div>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: '#8A7A6A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {featuredAnnonce.type === 'enchere_inversee' ? 'Enchère inversée' : 'Annonce'}
                </p>
                <p style={{ margin: '2px 0', fontSize: 14, fontWeight: 800, color: '#1A1209', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{featuredAnnonce.titre}</p>
                <p style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#C0392B', fontVariantNumeric: 'tabular-nums' }}>{getPrixAffiche(featuredAnnonce)}</p>
                {featuredAnnonce.type === 'enchere_inversee' && <p style={{ margin: '2px 0 0', fontSize: 10, color: '#8A7A6A' }}>Prix actuel</p>}
              </div>
              {featuredAnnonce.type === 'enchere_inversee' && (
                <div style={{
                  flexShrink: 0,
                  textAlign: 'right', padding: '8px 10px',
                  borderRadius: 10, backgroundColor: '#FBE9E7',
                }}>
                  <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: '#8A7A6A', textTransform: 'uppercase' }}>Prochaine baisse</p>
                  <CountdownInline />
                </div>
              )}
            </Link>
          </div>
        </>
      )}
    </div>
  )
}

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

  // Pour un défilement infini visuellement fluide, on triple la liste.
  // L'utilisateur démarre dans la copie centrale, et chaque fois qu'il
  // atteint une extrémité on saute silencieusement à la copie du milieu.
  // (Si un seul item, pas de tripling — pas de carousel.)
  const tripled = items.length > 1 ? [...items, ...items, ...items] : items
  const loop = items.length > 1

  // Démarre dans la copie du milieu au mount (et reset si items change)
  useEffect(() => {
    if (!loop) return
    const el = scrollerRef.current
    if (!el) return
    // Attendre un tick pour que clientWidth soit posé
    requestAnimationFrame(() => {
      el.scrollLeft = items.length * el.clientWidth
    })
  }, [items.length, loop])

  // Auto-play 3s — sauf pendant 8s après une interaction manuelle
  useEffect(() => {
    if (items.length <= 1) return
    const t = setInterval(() => {
      if (Date.now() < pausedUntil.current) return
      const el = scrollerRef.current
      if (!el) return
      const slideW = el.clientWidth
      if (!slideW) return
      // Toujours viser un multiple exact de slideW pour éviter les dérives
      // d'arrondi avec scroll-snap
      const currentIdx = Math.round(el.scrollLeft / slideW)
      el.scrollTo({ left: (currentIdx + 1) * slideW, behavior: 'smooth' })
    }, 3000)
    return () => clearInterval(t)
  }, [items.length])

  // Met à jour l'index actif + reset silencieux quand on franchit les extrémités
  function handleScroll() {
    const el = scrollerRef.current
    if (!el) return
    const slideW = el.clientWidth
    if (!slideW) return
    const physicalIdx = Math.round(el.scrollLeft / slideW)
    const wrapped = ((physicalIdx % items.length) + items.length) % items.length
    if (wrapped !== activeIdx) setActiveIdx(wrapped)

    // Debounce le reset jusqu'à ce que le scroll soit "fini" (sinon on coupe
    // l'animation smooth en cours et l'utilisateur voit un saut).
    if (loop) {
      if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current)
      scrollEndTimer.current = setTimeout(() => {
        const el2 = scrollerRef.current
        if (!el2) return
        const slideW2 = el2.clientWidth
        const idx2 = Math.round(el2.scrollLeft / slideW2)
        // 3e copie (≥ 2 × items.length) → on saute en arrière d'une copie
        if (idx2 >= items.length * 2) {
          el2.scrollLeft = (idx2 - items.length) * slideW2
        // 1ère copie (< items.length) → on saute en avant d'une copie
        } else if (idx2 < items.length) {
          el2.scrollLeft = (idx2 + items.length) * slideW2
        }
      }, 120)
    }
  }

  function handleInteraction() {
    // Pause autoplay 8s après touch/wheel pour ne pas combattre l'user
    pausedUntil.current = Date.now() + 8000
  }

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        onTouchStart={handleInteraction}
        onMouseDown={handleInteraction}
        onWheel={handleInteraction}
        style={{
          display: 'flex',
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          // PAS de scrollBehavior:'smooth' en CSS — sinon les resets silencieux
          // (scrollLeft = X) sont eux aussi animés, ce qui crée le retour visible.
          // On utilise behavior:'smooth' explicitement dans les scrollTo voulus.
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
        }}
        className="pdv-hscroll"
      >
        {tripled.map((item, idx) => (
          <div
            key={`slide-${idx}`}
            style={{
              flex: '0 0 100%',
              scrollSnapAlign: 'start',
              minWidth: 0,
            }}
          >
            {item.kind === 'evenement'
              ? <HeroEvent ev={item.data} onClick={() => onSelect(item)} />
              : <HeroEtabCard etab={item.data} onClick={() => onSelect(item)} />}
          </div>
        ))}
      </div>

      {/* Dots */}
      {items.length > 1 && (
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 6,
          marginTop: 10,
        }}>
          {items.map((_, i) => (
            <button
              key={i}
              onClick={() => {
                handleInteraction()
                const el = scrollerRef.current
                if (!el) return
                const slideW = el.clientWidth
                // On vise la copie la plus proche pour éviter un grand scroll
                const currentPhysical = Math.round(el.scrollLeft / slideW)
                const currentCopy = Math.floor(currentPhysical / items.length)
                const target = (currentCopy * items.length + i)
                el.scrollTo({ left: target * slideW, behavior: 'smooth' })
              }}
              aria-label={`Slide ${i + 1}`}
              style={{
                width: i === activeIdx ? 20 : 7, height: 7, borderRadius: 999,
                border: 'none', padding: 0,
                backgroundColor: i === activeIdx ? '#1A1209' : 'rgba(26,18,9,0.25)',
                cursor: 'pointer', transition: 'all 0.25s',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function HeroEtabCard({ etab, onClick }: { etab: HeroEtab; onClick: () => void }) {
  const photo = etab.photos?.[0]
  return (
    <div style={{ padding: '0 16px' }}>
      <button
        onClick={onClick}
        style={{
          width: '100%', textAlign: 'left',
          padding: 0, border: 'none', cursor: 'pointer',
          borderRadius: 24, overflow: 'hidden',
          backgroundColor: '#3A5BC7',
          position: 'relative',
          height: 248,
          boxShadow: '0 10px 32px rgba(44,28,16,0.22)',
          fontFamily: 'inherit',
        }}
      >
        {photo ? (
          <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #3A5BC7 0%, #2A4396 100%)' }} />
        )}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0) 25%, rgba(0,0,0,0.55) 65%, rgba(0,0,0,0.88) 100%)',
        }} />

        <span style={{
          position: 'absolute', top: 14, left: 14,
          backgroundColor: 'rgba(255,255,255,0.95)', color: '#3A5BC7',
          fontSize: 10, fontWeight: 800,
          padding: '6px 11px', borderRadius: 999,
          letterSpacing: '0.06em', textTransform: 'uppercase',
          boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
        }}>★ À découvrir</span>

        <div style={{ position: 'absolute', bottom: 16, left: 16, right: 16 }}>
          <h2 style={{
            margin: '0 0 6px', fontSize: 22, fontWeight: 900,
            color: '#fff', lineHeight: 1.1,
            textShadow: '0 1px 6px rgba(0,0,0,0.4)',
            overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>{etab.nom}</h2>

          {etab.commune && (
            <p style={{
              margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.92)',
              textShadow: '0 1px 4px rgba(0,0,0,0.4)',
            }}>📍 {etab.commune}</p>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '7px 14px', borderRadius: 999,
              backgroundColor: '#fff', color: '#1A1209',
              fontSize: 12, fontWeight: 800,
            }}>Découvrir →</span>
          </div>
        </div>
      </button>
    </div>
  )
}

function HeroEvent({ ev, onClick }: { ev: Evenement; onClick: () => void }) {
  const isSponsored = ev.promotion === 'max' || ev.promotion === 'pro'
  const cat = CATEGORIE_META[ev.categorie] ?? CATEGORIE_META.autre
  const whenLabel = ev.date_debut ? dateLabel(ev.date_debut) : ''
  return (
    <div style={{ padding: '0 16px' }}>
      <button
        onClick={onClick}
        style={{
          width: '100%', textAlign: 'left',
          padding: 0, border: 'none', cursor: 'pointer',
          borderRadius: 24, overflow: 'hidden',
          backgroundColor: '#1A3A2A',
          position: 'relative',
          height: 248,
          boxShadow: '0 10px 32px rgba(44,28,16,0.22)',
          fontFamily: 'inherit',
        }}
      >
        {ev.image_url ? (
          <img src={ev.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #2D5A3D 0%, #1A3A2A 100%)' }} />
        )}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0) 25%, rgba(0,0,0,0.55) 65%, rgba(0,0,0,0.88) 100%)',
        }} />

        <span style={{
          position: 'absolute', top: 14, left: 14,
          backgroundColor: isSponsored ? '#E8622A' : 'rgba(255,255,255,0.95)',
          color: isSponsored ? '#fff' : '#2D5A3D',
          fontSize: 10, fontWeight: 800,
          padding: '6px 11px', borderRadius: 999,
          letterSpacing: '0.06em', textTransform: 'uppercase',
          boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
        }}>{isSponsored ? '★ Sponsorisé' : '✦ À la une'}</span>

        <div style={{ position: 'absolute', bottom: 16, left: 16, right: 16 }}>
          <h2 style={{
            margin: '0 0 6px', fontSize: 22, fontWeight: 900,
            color: '#fff', lineHeight: 1.1,
            textShadow: '0 1px 6px rgba(0,0,0,0.4)',
            overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>{ev.titre}</h2>

          <p style={{
            margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.92)',
            display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8,
            textShadow: '0 1px 4px rgba(0,0,0,0.4)',
          }}>
            {whenLabel && <span>🗓️ {whenLabel}{ev.heure ? ` · ${ev.heure}` : ''}</span>}
            {ev.lieux?.nom && <span>📍 {ev.lieux.nom}</span>}
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '7px 14px', borderRadius: 999,
              backgroundColor: '#fff', color: '#1A1209',
              fontSize: 12, fontWeight: 800,
            }}>Voir l&apos;événement →</span>

            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '6px 10px', borderRadius: 999,
              backgroundColor: 'rgba(255,255,255,0.18)',
              backdropFilter: 'blur(8px)',
              color: '#fff', fontSize: 11, fontWeight: 700,
              border: '1px solid rgba(255,255,255,0.25)',
            }}>{cat.icon} {cat.label}</span>
          </div>
        </div>
      </button>
    </div>
  )
}

function SectionHeader({ title, cta, onCta }: { title: string; cta: string; onCta?: () => void }) {
  return (
    <div style={{ padding: '20px 18px 10px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#1A1209' }}>{title}</h3>
      {cta && (
        <button onClick={onCta} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#2D5A3D', padding: 0 }}>
          {cta} →
        </button>
      )}
    </div>
  )
}

function CountdownInline() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#C0392B', fontVariantNumeric: 'tabular-nums' }}>
      {formatCountdown(getNextDropDate(now).getTime() - now.getTime())}
    </p>
  )
}
