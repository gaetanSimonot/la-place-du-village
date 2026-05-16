'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import type { EtablissementType, Evenement } from '@/lib/types'
import { getPrixAffiche, type Annonce } from '@/lib/annonces'

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
  { id: 'agenda',      label: 'Agenda',        iconSrc: '/icones-rondes/01_agenda_culturel.png',         click: p => p.onSelectAgenda() },
  { id: 'annuaire',    label: 'Annuaire',      iconSrc: '/icones-rondes/02_annuaire_professionnel.png',  click: p => p.onSelectAnnuaire() },
  { id: 'producteurs', label: 'Producteurs',   iconSrc: '/icones-rondes/05_producteurs_vente_libre.png', click: p => p.onSelectProducteurs() },
  { id: 'restos',      label: 'Restos & Bars', iconSrc: '/icones-rondes/03_restos_bars.png',             click: p => p.onSelectAnnuaire('restaurant_bar') },
  { id: 'annonces',    label: 'Annonces',      iconSrc: '/icones-rondes/07_annonces_locales.png',        click: (_, r) => r.push('/annonces') },
  { id: 'promos',      label: 'Bons plans',    iconSrc: '/icones-rondes/11_promotions_locales.png',      click: (_, r) => r.push('/promotions') },
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
  const [featuredAnnonces, setFeaturedAnnonces] = useState<Annonce[]>([])
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

        // Re-merge dans l'ordre priority des slots
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

  // Annonces "Les prix baissent" : featured_slots homepage en tête (override) +
  // reste de la liste derrière (sponsored, enchères récentes). Pas de remplacement,
  // juste un re-ordering — comme pour les promos.
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const nowISO = new Date().toISOString()
      const ordered: Annonce[] = []
      const seen = new Set<string>()

      // 1. Featured admin/pro/boost en tête
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

      // 2. Sponsored
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

      // 3. Enchères inversées récentes (le concept "les prix baissent")
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

      // 4. Compléter avec annonces actives récentes (pour avoir au moins ~6 items)
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
      <div style={{ padding: '10px 18px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <Link
            href={profile ? `/profil/${profile.id ?? ''}` : '/?tab=profil'}
            aria-label="Mon profil"
            style={{
              display: 'flex', alignItems: 'center',
              textDecoration: 'none', color: 'inherit',
              flexShrink: 0,
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              backgroundColor: '#2D5A3D', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 800,
              backgroundImage: profile?.avatar_url ? `url(${profile.avatar_url})` : undefined,
              backgroundSize: 'cover', backgroundPosition: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.10)',
            }}>
              {!profile?.avatar_url && ((profile?.display_name?.[0] || '?').toUpperCase())}
            </div>
          </Link>
          <h1 style={{
            flex: 1, minWidth: 0,
            fontFamily: '"Playfair Display", Georgia, serif',
            fontStyle: 'italic',
            fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em',
            color: '#2D5A3D', margin: 0,
            lineHeight: 1.0,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            textAlign: 'center',
          }}>
            La Place du Village
          </h1>
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
                  color: '#2D5A3D',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="16" x2="12" y2="12"/>
                  <line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
              </button>
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

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10 }}>
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            <div style={{
              width: 38, height: 3, borderRadius: 999,
              backgroundColor: '#E8622A', margin: '0 0 6px',
            }} />
            <p style={{
              fontFamily: '"Caveat", cursive',
              fontWeight: 500,
              margin: 0, fontSize: 18, color: '#7A6A5A',
              lineHeight: 1.05,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {subtitle}
            </p>
          </div>
          <Image
            src="/village-illustration.png"
            alt=""
            width={300}
            height={150}
            priority
            style={{
              flexShrink: 0,
              width: 110, height: 'auto',
              marginRight: -12,
              userSelect: 'none',
              mixBlendMode: 'multiply',
            }}
          />
        </div>
      </div>

      {/* ── 2. Hero carousel (events + établissements featured) ──────────── */}
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

      {/* ── 3. Tuiles accès rapide ────────────────────────────────────────── */}
      <div style={{ padding: '14px 14px 6px' }}>
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 6 }} className="pdv-hscroll">
          {TILES.map(t => (
            <button
              key={t.id}
              onClick={() => t.click({ onSelectAgenda, onSelectAnnuaire, onSelectProducteurs, onComingSoon, onUpgradePrompt }, router)}
              style={{
                flex: '0 0 auto',
                width: 112,
                height: 112,
                padding: '10px 8px',
                borderRadius: 22, border: 'none',
                backgroundColor: '#FFFFFF',
                boxShadow: '0 2px 8px rgba(44,28,16,0.05)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'transform 0.12s ease, box-shadow 0.12s ease',
              }}
            >
              <Image
                src={t.iconSrc}
                alt={t.label}
                width={58}
                height={58}
                style={{ width: 58, height: 58, display: 'block', flexShrink: 0 }}
                priority
              />
              <p style={{
                margin: 0, fontSize: 12.5, fontWeight: 600,
                color: '#1A1209', lineHeight: 1.15,
                letterSpacing: '-0.01em',
                textAlign: 'center',
              }}>{t.label}</p>
            </button>
          ))}
        </div>
      </div>

      {/* ── 4. Aujourd'hui dans le village ────────────────────────────────── */}
      {todayEvents.length > 0 && (
        <SectionHeader icon={<IconCalendar />} title="Aujourd'hui dans le village" cta="Voir tout" onCta={onSelectAgenda} />
      )}
      {todayEvents.length > 0 && (
        <div style={{ overflowX: 'auto', padding: '0 14px 4px' }} className="pdv-hscroll">
          <div style={{ display: 'flex', gap: 10 }}>
            {todayEvents.slice(0, 8).map(e => (
              <Link
                key={e.id}
                href={`/evenement/${e.id}`}
                style={{
                  flex: '0 0 230px',
                  display: 'flex', alignItems: 'center', gap: 9,
                  padding: 8, borderRadius: 12,
                  backgroundColor: '#fff', boxShadow: '0 1px 6px rgba(44,28,16,0.05)',
                  textDecoration: 'none', color: 'inherit',
                }}
              >
                <div style={{
                  width: 48, height: 48, flexShrink: 0,
                  borderRadius: 9, overflow: 'hidden',
                  backgroundColor: '#F0EBE3',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20,
                }}>
                  {e.image_url
                    ? <img src={e.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : '🎉'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#1A1209', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>{e.titre}</p>
                  {e.lieux?.nom && <p style={{ margin: '1px 0 0', fontSize: 11, color: '#8A7A6A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 3, maxWidth: '100%' }}><IconPin size={10} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.lieux.nom}</span></p>}
                  <p style={{ margin: '2px 0 0', fontSize: 10.5, color: '#2D5A3D', fontWeight: 700 }}>{dateLabel(e.date_debut)}{e.heure && ` · ${e.heure}`}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── 5. Bons plans (promotions) ────────────────────────────────────── */}
      {promos.length > 0 && (
        <>
          <SectionHeader icon={<IconGift />} title="Bons plans autour de vous" cta="Voir tout" onCta={() => router.push('/promotions')} />
          <div style={{ overflowX: 'auto', padding: '0 14px 4px' }} className="pdv-hscroll">
            <div style={{ display: 'flex', gap: 10 }}>
              {promos.map(p => (
                <Link
                  key={p.id}
                  href={`/promotions?id=${p.id}`}
                  style={{
                    flex: '0 0 140px',
                    borderRadius: 12, overflow: 'hidden',
                    backgroundColor: '#fff', boxShadow: '0 1px 6px rgba(44,28,16,0.05)',
                    textDecoration: 'none', color: 'inherit',
                  }}
                >
                  <div style={{
                    height: 82, backgroundColor: '#F0EBE3',
                    backgroundImage: p.display_image_url ? `url(${p.display_image_url})` : undefined,
                    backgroundSize: 'cover', backgroundPosition: 'center',
                    position: 'relative',
                  }}>
                    <span style={{
                      position: 'absolute', top: 5, left: 5,
                      backgroundColor: '#E8622A', color: '#fff',
                      fontSize: 9, fontWeight: 800,
                      padding: '2px 7px', borderRadius: 999,
                      letterSpacing: '0.02em',
                    }}>BON PLAN</span>
                  </div>
                  <div style={{ padding: '8px 10px 10px' }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#1A1209', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>{p.title}</p>
                    {p.etablissement?.nom && <p style={{ margin: '1px 0 0', fontSize: 10.5, color: '#8A7A6A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.etablissement.nom}</p>}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── 6. Annonces "Les prix baissent" — carousel horizontal ─────────── */}
      {featuredAnnonces.length > 0 && (
        <>
          <SectionHeader icon={<IconTrendDown />} title="Les prix baissent" cta="Voir les annonces" onCta={() => router.push('/annonces')} />
          <div style={{ overflowX: 'auto', padding: '0 14px 4px' }} className="pdv-hscroll">
            <div style={{ display: 'flex', gap: 10 }}>
              {featuredAnnonces.map(a => (
                <Link
                  key={a.id}
                  href={`/annonces/${a.id}`}
                  style={{
                    flex: '0 0 140px',
                    borderRadius: 12, overflow: 'hidden',
                    backgroundColor: '#fff', boxShadow: '0 1px 6px rgba(44,28,16,0.06)',
                    textDecoration: 'none', color: 'inherit',
                    display: 'flex', flexDirection: 'column',
                  }}
                >
                  <div style={{
                    height: 82, backgroundColor: '#F0EBE3',
                    backgroundImage: a.photos?.[0] ? `url(${a.photos[0]})` : undefined,
                    backgroundSize: 'cover', backgroundPosition: 'center',
                    position: 'relative',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {!a.photos?.[0] && (
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#B0A090" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                        <line x1="7" y1="7" x2="7.01" y2="7"/>
                      </svg>
                    )}
                    {a.type === 'enchere_inversee' && (
                      <span style={{
                        position: 'absolute', top: 5, left: 5,
                        backgroundColor: '#C0392B', color: '#fff',
                        fontSize: 9, fontWeight: 800,
                        padding: '2px 7px', borderRadius: 999,
                        letterSpacing: '0.02em',
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                      }}>
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/>
                          <polyline points="17 18 23 18 23 12"/>
                        </svg>
                        Enchère
                      </span>
                    )}
                  </div>
                  <div style={{ padding: '8px 10px 10px' }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#1A1209', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>{a.titre}</p>
                    <p style={{ margin: '1px 0 0', fontSize: 12.5, fontWeight: 800, color: '#C0392B', fontVariantNumeric: 'tabular-nums' }}>{getPrixAffiche(a)}</p>
                  </div>
                </Link>
              ))}
            </div>
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

  // Auto-play 5s — sauf pendant 8s après une interaction manuelle
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
    }, 5000)
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
            {item.kind === 'evenement'     ? <HeroEvent      ev={item.data}    onClick={() => onSelect(item)} /> :
             item.kind === 'etablissement' ? <HeroEtabCard   etab={item.data}  onClick={() => onSelect(item)} /> :
                                              <HeroProducteurCard prod={item.data} onClick={() => onSelect(item)} />}
          </div>
        ))}
      </div>

      {/* Dots — petits, en bas à droite */}
      {items.length > 1 && (
        <div style={{
          position: 'absolute',
          right: 26, bottom: 12,
          display: 'flex', gap: 4,
          padding: '3px 6px', borderRadius: 999,
          backgroundColor: 'rgba(0,0,0,0.28)',
          backdropFilter: 'blur(4px)',
          pointerEvents: 'none',
        }}>
          {items.map((_, i) => (
            <button
              key={i}
              onClick={() => {
                handleInteraction()
                const el = scrollerRef.current
                if (!el) return
                const slideW = el.clientWidth
                const currentPhysical = Math.round(el.scrollLeft / slideW)
                const currentCopy = Math.floor(currentPhysical / items.length)
                const target = (currentCopy * items.length + i)
                el.scrollTo({ left: target * slideW, behavior: 'smooth' })
              }}
              aria-label={`Slide ${i + 1}`}
              style={{
                width: i === activeIdx ? 12 : 5, height: 5, borderRadius: 999,
                border: 'none', padding: 0,
                backgroundColor: i === activeIdx ? '#FFFFFF' : 'rgba(255,255,255,0.55)',
                cursor: 'pointer', transition: 'all 0.25s',
                pointerEvents: 'auto',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function HeroProducteurCard({ prod, onClick }: { prod: HeroProducteur; onClick: () => void }) {
  const photo = prod.photos?.[0]
  return (
    <div style={{ padding: '0 16px' }}>
      <button
        onClick={onClick}
        style={{
          width: '100%', textAlign: 'left',
          padding: 0, border: 'none', cursor: 'pointer',
          borderRadius: 24, overflow: 'hidden',
          backgroundColor: '#2D5A3D',
          position: 'relative',
          height: 200,
          boxShadow: '0 10px 32px rgba(44,28,16,0.22)',
          fontFamily: 'inherit',
        }}
      >
        {photo ? (
          <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #2D5A3D 0%, #4A8B5C 100%)' }} />
        )}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0) 25%, rgba(0,0,0,0.55) 65%, rgba(0,0,0,0.88) 100%)',
        }} />

        <span style={{
          position: 'absolute', top: 14, left: 14,
          backgroundColor: 'rgba(255,255,255,0.95)', color: '#2D5A3D',
          fontSize: 10, fontWeight: 800,
          padding: '6px 11px', borderRadius: 999,
          letterSpacing: '0.06em', textTransform: 'uppercase',
          boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
          display: 'inline-flex', alignItems: 'center', gap: 5,
        }}><IconLeaf size={11} />Producteur local</span>

        <div style={{ position: 'absolute', bottom: 16, left: 16, right: 16 }}>
          <h2 style={{
            margin: '0 0 6px', fontSize: 22, fontWeight: 900,
            color: '#fff', lineHeight: 1.1,
            textShadow: '0 1px 6px rgba(0,0,0,0.4)',
            overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>{prod.nom}</h2>

          {prod.commune && (
            <p style={{
              margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.92)',
              textShadow: '0 1px 4px rgba(0,0,0,0.4)',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}><IconPin size={12} />{prod.commune}</p>
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
          height: 200,
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
          display: 'inline-flex', alignItems: 'center', gap: 5,
        }}><IconStar size={11} />À découvrir</span>

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
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}><IconPin size={12} />{etab.commune}</p>
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
          height: 200,
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
          display: 'inline-flex', alignItems: 'center', gap: 5,
        }}><IconStar size={11} />{isSponsored ? 'Sponsorisé' : 'À la une'}</span>

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
            display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10,
            textShadow: '0 1px 4px rgba(0,0,0,0.4)',
          }}>
            {whenLabel && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><IconCalendar />{whenLabel}{ev.heure ? ` · ${ev.heure}` : ''}</span>}
            {ev.lieux?.nom && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><IconPin size={12} />{ev.lieux.nom}</span>}
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

function SectionHeader({ icon, title, cta, onCta }: { icon?: React.ReactNode; title: string; cta: string; onCta?: () => void }) {
  return (
    <div style={{ padding: '18px 18px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        {icon && <span style={{ flexShrink: 0, display: 'inline-flex', color: '#2D5A3D' }}>{icon}</span>}
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#1A1209', letterSpacing: '-0.015em', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</h3>
      </div>
      {cta && (
        <button onClick={onCta} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#2D5A3D', padding: 0, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {cta} →
        </button>
      )}
    </div>
  )
}

const IconCalendar = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
)
const IconGift = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 12 20 22 4 22 4 12"/>
    <rect x="2" y="7" width="20" height="5"/>
    <line x1="12" y1="22" x2="12" y2="7"/>
    <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
    <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
  </svg>
)
const IconTrendDown = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/>
    <polyline points="17 18 23 18 23 12"/>
  </svg>
)
const IconPin = ({ size = 11 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
    <circle cx="12" cy="10" r="3"/>
  </svg>
)
const IconStar =({ size = 11, filled = true }: { size?: number; filled?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
)
const IconLeaf = ({ size = 11 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M21 6c-6.5 0-12 5.5-12 12 0 1 0 2 .5 3-1.5-1.5-3-4-3-7 0-5 4-9 9-9 1 0 2 0 3 .5C18.5 5 19.5 5 21 6z"/>
    <path d="M9 18c0-5 4-9 9-9"/>
  </svg>
)

