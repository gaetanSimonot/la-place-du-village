'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { EvenementCard } from '@/lib/types'
import { formatEventDate } from '@/lib/filters'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAnnonceFavorites } from '@/hooks/useAnnonceFavorites'
import { authedFetcher } from '@/lib/swr-fetchers'
import { ETAB_TYPES } from '@/lib/etablissement-types'
import { getPrixAffiche, type Annonce } from '@/lib/annonces'

interface ProducerMin {
  id: string; nom: string; commune: string | null; photos: string[]; produit_categories: string[]
}
interface EtabMin {
  id: string; nom: string; commune: string | null; photos: string[]; type: string
}

interface Props {
  events: EvenementCard[]
  onToggleFav: (id: string) => void
  onOpenProducer?: (id: string) => void
  onOpenEtablissement?: (id: string) => void
  onBack?: () => void
}

type Section = 'favoris' | 'suivis'
type FavoSub = 'all' | 'annonces' | 'events' | 'producteurs' | 'commerces' | 'promos'
type SuivisSub = 'all' | 'producteurs' | 'commerces'

interface PromoMin { id: string; title: string; image: string | null; etabNom: string | null }

const CAT_TAG = {
  annonce:    { label: 'ANNONCE',    bg: '#FFF0E5', color: '#C84B2F' },
  event:      { label: 'ÉVÉNEMENT',  bg: '#E8EEF7', color: '#3A5D8C' },
  producteur: { label: 'PRODUCTEUR', bg: '#E8F2EB', color: '#2D5A3D' },
  commerce:   { label: 'COMMERCE',   bg: '#FDE8DF', color: '#C0440A' },
  promo:      { label: 'PROMO',      bg: '#FFF0E5', color: '#E8622A' },
} as const

/* ── Icons SVG lineart (cohérents avec action bar évènement) ──────── */
const IcHeart = ({ size = 16, filled = false }: { size?: number; filled?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>
)
const IcBell = ({ size = 16, filled = false }: { size?: number; filled?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
  </svg>
)
const IcTag = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
    <line x1="7" y1="7" x2="7.01" y2="7"/>
  </svg>
)
const IcCalendar = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
)
const IcLeaf = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/>
    <path d="M2 21c0-3 1.85-5.36 5.08-6"/>
  </svg>
)
const IcStore = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l2-6h14l2 6"/>
    <path d="M3 9v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9"/>
    <path d="M3 9h18"/>
    <path d="M9 21V13h6v8"/>
  </svg>
)

export default function FavorisView({ events, onToggleFav, onOpenProducer, onOpenEtablissement, onBack }: Props) {
  const { user, loading: authLoading } = useAuth()

  const [section, setSection]   = useState<Section>('favoris')
  const [favoSub, setFavoSub]   = useState<FavoSub>('all')
  const [suivisSub, setSuivisSub] = useState<SuivisSub>('all')

  const favKey = !authLoading && user ? '/api/favoris' : null
  const { data, isLoading, mutate } = useSWR<{
    producerFavs: ProducerMin[]; producerFollows: ProducerMin[];
    etabFavs: EtabMin[]; etabFollows: EtabMin[]; promoFavs: PromoMin[];
  }>(favKey, authedFetcher)
  const producerFavs    = data?.producerFavs    ?? []
  const producerFollows = data?.producerFollows ?? []
  const etabFavs        = data?.etabFavs        ?? []
  const etabFollows     = data?.etabFollows     ?? []
  const promoFavs       = data?.promoFavs       ?? []
  const loading = isLoading && !data

  const removeProducerFav = (id: string) =>
    mutate(prev => prev ? { ...prev, producerFavs: prev.producerFavs.filter(x => x.id !== id) } : prev, false)
  const removeEtabFav = (id: string) =>
    mutate(prev => prev ? { ...prev, etabFavs: prev.etabFavs.filter(x => x.id !== id) } : prev, false)
  const removeProducerFollow = (id: string) =>
    mutate(prev => prev ? { ...prev, producerFollows: prev.producerFollows.filter(x => x.id !== id) } : prev, false)
  const removeEtabFollow = (id: string) =>
    mutate(prev => prev ? { ...prev, etabFollows: prev.etabFollows.filter(x => x.id !== id) } : prev, false)
  const removePromoFav = (id: string) =>
    mutate(prev => prev ? { ...prev, promoFavs: prev.promoFavs.filter(x => x.id !== id) } : prev, false)

  const { favIds: annonceFavIds, toggle: toggleAnnonceFav } = useAnnonceFavorites()
  const { data: annoncesData } = useSWR<{ annonces: Annonce[] }>(
    user && annonceFavIds.length > 0 ? '/api/annonces/public' : null,
  )
  const annonceFavs = useMemo(
    () => ((annoncesData?.annonces ?? []) as Annonce[]).filter(a => annonceFavIds.includes(a.id)),
    [annoncesData, annonceFavIds],
  )

  // ── Compteurs ────────────────────────────────────────────────────────
  const favoCounts = {
    all:          annonceFavs.length + events.length + producerFavs.length + etabFavs.length + promoFavs.length,
    annonces:     annonceFavs.length,
    events:       events.length,
    producteurs:  producerFavs.length,
    commerces:    etabFavs.length,
    promos:       promoFavs.length,
  }
  const suivisCounts = {
    all:          producerFollows.length + etabFollows.length,
    producteurs:  producerFollows.length,
    commerces:    etabFollows.length,
  }

  // ── Rows à afficher : on construit une liste plate uniforme ────────
  const rows = useMemo(() => {
    if (section === 'favoris') {
      const out: RowItem[] = []
      if (favoSub === 'all' || favoSub === 'annonces') {
        for (const a of annonceFavs) out.push(annonceToRow(a, () => toggleAnnonceFav(a.id)))
      }
      if (favoSub === 'all' || favoSub === 'events') {
        for (const e of events) out.push(eventToRow(e, () => onToggleFav(e.id)))
      }
      if (favoSub === 'all' || favoSub === 'producteurs') {
        for (const p of producerFavs) {
          out.push(producerFavToRow(p,
            () => onOpenProducer?.(p.id),
            async () => {
              await supabase.from('producer_favorites').delete().eq('producer_id', p.id).eq('user_id', user!.id)
              removeProducerFav(p.id)
            },
          ))
        }
      }
      if (favoSub === 'all' || favoSub === 'commerces') {
        for (const e of etabFavs) {
          out.push(etabFavToRow(e,
            () => onOpenEtablissement?.(e.id),
            async () => {
              await supabase.from('etablissement_favorites').delete().eq('etablissement_id', e.id).eq('user_id', user!.id)
              removeEtabFav(e.id)
            },
          ))
        }
      }
      if (favoSub === 'all' || favoSub === 'promos') {
        for (const p of promoFavs) {
          out.push(promoFavToRow(p,
            () => { if (typeof window !== 'undefined') window.location.href = `/promotions?id=${p.id}` },
            async () => {
              const { data: { session } } = await supabase.auth.getSession()
              await fetch(`/api/promotions/${p.id}/favorite`, { method: 'POST', headers: session ? { Authorization: `Bearer ${session.access_token}` } : {} })
              removePromoFav(p.id)
            },
          ))
        }
      }
      return out
    }
    // section === 'suivis'
    const out: RowItem[] = []
    if (suivisSub === 'all' || suivisSub === 'producteurs') {
      for (const p of producerFollows) {
        out.push(producerFollowToRow(p,
          () => onOpenProducer?.(p.id),
          async () => {
            await supabase.from('producer_followers').delete().eq('producer_id', p.id).eq('user_id', user!.id)
            removeProducerFollow(p.id)
          },
        ))
      }
    }
    if (suivisSub === 'all' || suivisSub === 'commerces') {
      for (const e of etabFollows) {
        out.push(etabFollowToRow(e,
          () => onOpenEtablissement?.(e.id),
          async () => {
            await supabase.from('etablissement_followers').delete().eq('etablissement_id', e.id).eq('user_id', user!.id)
            removeEtabFollow(e.id)
          },
        ))
      }
    }
    return out
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, favoSub, suivisSub, annonceFavs, events, producerFavs, etabFavs, promoFavs, producerFollows, etabFollows])

  return (
    <main className="min-h-[100dvh] bg-creme pb-28 font-inter text-texte">
      {/* ── Top bar ──────────────────────────────────── */}
      <div
        className="flex items-center justify-between gap-2.5 px-4 pt-3.5"
        style={{ paddingTop: 'max(14px, env(safe-area-inset-top, 14px))' }}
      >
        {onBack ? (
          <button
            onClick={onBack}
            aria-label="Retour"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border bg-white text-texte"
            style={{ borderColor: '#E8E0D4', boxShadow: '0 1px 2px rgba(44,28,16,0.04)' }}
          >
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
        ) : <div className="h-10 w-10 shrink-0" />}
        <div className="font-serif text-[18px] leading-none text-texte" style={{ letterSpacing: '-0.005em' }}>
          Mes favoris
        </div>
        <div className="h-10 w-10 shrink-0" />
      </div>

      {/* ── 2 grandes sections : Favoris / Suivis ───────────────────── */}
      <div className="px-4 pt-3.5">
        <div className="grid grid-cols-2 gap-1 rounded-[14px] p-1" style={{ background: '#F7F1E6' }}>
          {([
            { id: 'favoris' as Section, label: 'Favoris', color: '#C84B2F', count: favoCounts.all },
            { id: 'suivis'  as Section, label: 'Suivis',  color: '#2D5A3D', count: suivisCounts.all },
          ]).map(s => {
            const active = section === s.id
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                className="flex items-center justify-center gap-1.5 rounded-[11px] py-2.5 text-[13.5px]"
                style={{
                  background: active ? '#FFFFFF' : 'transparent',
                  boxShadow:  active ? '0 1px 3px rgba(44,28,16,0.10)' : 'none',
                  color:      active ? '#1A1209' : '#7A6A5A',
                  fontWeight: active ? 800 : 700,
                  letterSpacing: '-0.005em',
                }}
              >
                <span style={{ color: active ? s.color : '#7A6A5A', display: 'inline-flex' }}>
                  {s.id === 'favoris' ? <IcHeart size={16} filled={active} /> : <IcBell size={16} filled={active} />}
                </span>
                <span>{s.label}</span>
                {s.count > 0 && (
                  <span className="ml-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-extrabold"
                    style={{ background: active ? '#F7F1E6' : 'transparent', color: active ? '#7A6A5A' : '#A99B89' }}>
                    {s.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Pills sous-catégories (flex-wrap, style messagerie) ─────── */}
      {section === 'favoris' && (
        <div className="flex flex-wrap gap-1.5 px-4 pt-3.5">
          <CatPill active={favoSub === 'all'}         onClick={() => setFavoSub('all')}         label="Toutes"      count={favoCounts.all} />
          <CatPill active={favoSub === 'annonces'}    onClick={() => setFavoSub('annonces')}    label="Annonces"    count={favoCounts.annonces} />
          <CatPill active={favoSub === 'events'}      onClick={() => setFavoSub('events')}      label="Événements"  count={favoCounts.events} />
          <CatPill active={favoSub === 'producteurs'} onClick={() => setFavoSub('producteurs')} label="Producteurs" count={favoCounts.producteurs} />
          <CatPill active={favoSub === 'commerces'}   onClick={() => setFavoSub('commerces')}   label="Commerces"   count={favoCounts.commerces} />
          <CatPill active={favoSub === 'promos'}      onClick={() => setFavoSub('promos')}      label="Promotions"  count={favoCounts.promos} />
        </div>
      )}
      {section === 'suivis' && (
        <div className="flex flex-wrap gap-1.5 px-4 pt-3.5">
          <CatPill active={suivisSub === 'all'}         onClick={() => setSuivisSub('all')}         label="Tous"        count={suivisCounts.all} />
          <CatPill active={suivisSub === 'producteurs'} onClick={() => setSuivisSub('producteurs')} label="Producteurs" count={suivisCounts.producteurs} />
          <CatPill active={suivisSub === 'commerces'}   onClick={() => setSuivisSub('commerces')}   label="Commerces"   count={suivisCounts.commerces} />
        </div>
      )}

      {/* ── Liste plate uniforme (style messagerie) ─────────────────── */}
      <div className="pt-3.5">
        {!user && (
          <div className="mx-4 rounded-[14px] border bg-white p-6 text-center" style={{ borderColor: '#F0EAE0' }}>
            <p className="m-0 mb-1 text-[14px] font-extrabold text-texte">Connexion requise</p>
            <p className="m-0 text-[12px] text-texte-doux">Connecte-toi pour voir tes favoris et suivis.</p>
          </div>
        )}
        {user && loading && <p className="px-4 py-6 text-center text-[12px] text-texte-doux">Chargement…</p>}
        {user && !loading && rows.length === 0 && (
          <div className="mx-4 rounded-[14px] border bg-white p-6 text-center" style={{ borderColor: '#F0EAE0' }}>
            <p className="m-0 mb-1 text-[14px] font-extrabold text-texte">
              {section === 'favoris' ? 'Aucun favori' : 'Aucun abonnement'}
            </p>
            <p className="m-0 text-[12px] text-texte-doux">
              {section === 'favoris'
                ? 'Appuie sur le cœur d\'une annonce, d\'un événement, d\'un producteur ou d\'un commerce pour le retrouver ici.'
                : 'Suis des producteurs et commerces pour ne rien rater.'}
            </p>
          </div>
        )}
        {user && !loading && rows.map(r => <Row key={r.key} row={r} />)}
      </div>
    </main>
  )
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Row model uniforme — pattern ConvoRow de la messagerie unifiée        */
/* ─────────────────────────────────────────────────────────────────────── */

interface RowItem {
  key:       string
  href?:     string
  onClick?:  () => void
  onRemove?: () => void
  removeKind: 'heart' | 'bell'
  imageUrl:  string | null
  imageBg:   string
  /** Icône SVG rendue dans le placeholder si pas d'imageUrl. */
  fallbackIcon: React.ReactNode
  /** Couleur de l'icône placeholder (assortie à la catégorie). */
  fallbackColor: string
  tag:       { label: string; bg: string; color: string }
  title:     string
  subtitle:  string
}

function annonceToRow(a: Annonce, onRemove: () => void): RowItem {
  return {
    key:       `annonce-${a.id}`,
    href:      `/annonces/${a.id}`,
    onRemove,
    removeKind: 'heart',
    imageUrl:  a.photos?.[0] ?? null,
    imageBg:   '#FFF0E5',
    fallbackIcon:  <IcTag size={22} />,
    fallbackColor: '#C84B2F',
    tag:       CAT_TAG.annonce,
    title:     a.titre,
    subtitle:  `${getPrixAffiche(a)}${a.ville ? ' • ' + a.ville : ''}`,
  }
}

function eventToRow(e: EvenementCard, onRemove: () => void): RowItem {
  const date = e.date_debut ? formatEventDate(e.date_debut, e.date_fin) : ''
  const commune = e.lieux?.commune ?? ''
  return {
    key:       `event-${e.id}`,
    href:      `/evenement/${e.id}`,
    onRemove,
    removeKind: 'heart',
    imageUrl:  e.image_url ?? null,
    imageBg:   '#E8EEF7',
    fallbackIcon:  <IcCalendar size={22} />,
    fallbackColor: '#3A5D8C',
    tag:       CAT_TAG.event,
    title:     e.titre,
    subtitle:  [date, commune].filter(Boolean).join(' • '),
  }
}

function producerFavToRow(p: ProducerMin, onClick: () => void, onRemove: () => void): RowItem {
  return {
    key:       `producteur-fav-${p.id}`,
    onClick,
    onRemove,
    removeKind: 'heart',
    imageUrl:  p.photos?.[0] ?? null,
    imageBg:   '#E8F2EB',
    fallbackIcon:  <IcLeaf size={22} />,
    fallbackColor: '#2D5A3D',
    tag:       CAT_TAG.producteur,
    title:     p.nom,
    subtitle:  p.commune ?? '',
  }
}

function producerFollowToRow(p: ProducerMin, onClick: () => void, onRemove: () => void): RowItem {
  return {
    key:       `producteur-follow-${p.id}`,
    onClick,
    onRemove,
    removeKind: 'bell',
    imageUrl:  p.photos?.[0] ?? null,
    imageBg:   '#E8F2EB',
    fallbackIcon:  <IcLeaf size={22} />,
    fallbackColor: '#2D5A3D',
    tag:       CAT_TAG.producteur,
    title:     p.nom,
    subtitle:  p.commune ?? '',
  }
}

function promoFavToRow(p: PromoMin, onClick: () => void, onRemove: () => void): RowItem {
  return {
    key:       `promo-fav-${p.id}`,
    onClick,
    onRemove,
    removeKind: 'heart',
    imageUrl:  p.image ?? null,
    imageBg:   '#FFF0E5',
    fallbackIcon:  <IcTag size={22} />,
    fallbackColor: '#E8622A',
    tag:       CAT_TAG.promo,
    title:     p.title,
    subtitle:  p.etabNom ?? 'Bon plan',
  }
}

function etabFavToRow(e: EtabMin, onClick: () => void, onRemove: () => void): RowItem {
  const typeInfo = ETAB_TYPES[e.type as keyof typeof ETAB_TYPES]
  return {
    key:       `commerce-fav-${e.id}`,
    onClick,
    onRemove,
    removeKind: 'heart',
    imageUrl:  e.photos?.[0] ?? null,
    imageBg:   typeInfo?.bg ?? '#FDE8DF',
    fallbackIcon:  <IcStore size={22} />,
    fallbackColor: '#C0440A',
    tag:       CAT_TAG.commerce,
    title:     e.nom,
    subtitle:  `${typeInfo?.label ?? e.type}${e.commune ? ' · ' + e.commune : ''}`,
  }
}

function etabFollowToRow(e: EtabMin, onClick: () => void, onRemove: () => void): RowItem {
  const typeInfo = ETAB_TYPES[e.type as keyof typeof ETAB_TYPES]
  return {
    key:       `commerce-follow-${e.id}`,
    onClick,
    onRemove,
    removeKind: 'bell',
    imageUrl:  e.photos?.[0] ?? null,
    imageBg:   typeInfo?.bg ?? '#FDE8DF',
    fallbackIcon:  <IcStore size={22} />,
    fallbackColor: '#C0440A',
    tag:       CAT_TAG.commerce,
    title:     e.nom,
    subtitle:  `${typeInfo?.label ?? e.type}${e.commune ? ' · ' + e.commune : ''}`,
  }
}

/* ── Pill catégorie (style messagerie unifiée) ─────────────────────── */
function CatPill({
  active, onClick, label, count,
}: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-[7px] text-[12px] font-bold"
      style={{
        background: active ? '#1A1209' : '#FFFFFF',
        color: active ? '#FDFAF5' : '#1A1209',
        borderColor: active ? '#1A1209' : '#E8E0D4',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
      <span className="text-[10px] font-extrabold" style={{ opacity: active ? 0.85 : 0.7 }}>
        {count}
      </span>
    </button>
  )
}

/* ── Row uniforme (pattern ConvoRow messagerie) ────────────────────── */
function Row({ row }: { row: RowItem }) {
  const content = (
    <div
      className="flex w-full items-center gap-[11px] bg-transparent px-4 py-3 text-inherit no-underline"
      style={{ borderBottom: '1px solid #F0EAE0', cursor: 'pointer' }}
      onClick={row.onClick}
    >
      {/* Avatar / miniature 48px */}
      {row.imageUrl ? (
        <img
          src={row.imageUrl}
          alt=""
          loading="lazy"
          className="h-12 w-12 shrink-0 rounded-[12px] object-cover"
          style={{ border: '2px solid #FDFAF5', background: row.imageBg }}
        />
      ) : (
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px]"
          style={{ background: row.imageBg, border: '2px solid #FDFAF5', color: row.fallbackColor }}
        >
          {row.fallbackIcon}
        </div>
      )}

      {/* Bloc texte */}
      <div className="min-w-0 flex-1 pt-[1px]">
        <div className="mb-[3px]">
          <span
            className="inline-block rounded-[5px] px-[6px] py-[2px] text-[8.5px] font-extrabold uppercase"
            style={{ background: row.tag.bg, color: row.tag.color, letterSpacing: '0.06em' }}
          >
            {row.tag.label}
          </span>
        </div>
        <div className="truncate text-[14px] font-bold text-texte" style={{ letterSpacing: '-0.005em' }}>
          {row.title}
        </div>
        {row.subtitle && (
          <div className="mt-[2px] truncate text-[12px] text-texte-doux">{row.subtitle}</div>
        )}
      </div>

      {/* Bouton remove (cœur fill rouge ou cloche) */}
      {row.onRemove && (
        <button
          type="button"
          onClick={e => { e.preventDefault(); e.stopPropagation(); row.onRemove?.() }}
          aria-label={row.removeKind === 'heart' ? 'Retirer des favoris' : 'Ne plus suivre'}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-none"
          style={{
            background: row.removeKind === 'heart' ? '#FFF0E5' : '#E8F2EB',
            color:      row.removeKind === 'heart' ? '#C84B2F' : '#2D5A3D',
          }}
        >
          {row.removeKind === 'heart' ? <IcHeart size={16} filled /> : <IcBell size={16} filled />}
        </button>
      )}
    </div>
  )

  return row.href ? <Link href={row.href} className="block no-underline">{content}</Link> : content
}
