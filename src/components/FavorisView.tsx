'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { EvenementCard } from '@/lib/types'
import { CATEGORIES } from '@/lib/categories'
import { formatEventDate } from '@/lib/filters'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAnnonceFavorites } from '@/hooks/useAnnonceFavorites'
import { authedFetcher } from '@/lib/swr-fetchers'
import { PRODUIT_CATS_MAP } from '@/lib/produit-cats'
import { ETAB_TYPES } from '@/lib/etablissement-types'
import AnnonceCard from '@/components/AnnonceCard'
import type { Annonce } from '@/lib/annonces'

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

type Filter = 'annonces' | 'events' | 'producteurs' | 'commerces' | 'suivis'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'annonces',    label: 'Annonces' },
  { id: 'events',      label: 'Événements' },
  { id: 'producteurs', label: 'Producteurs' },
  { id: 'commerces',   label: 'Commerces' },
  { id: 'suivis',      label: 'Suivis' },
]

const T = {
  primary: '#2D5A3D',
  primaryLight: '#E8F2EB',
  accent: '#C84B2F',
  texte: '#1A1209',
  texteDoux: '#7A6A5A',
  texteTresDoux: '#A99B89',
  creme: '#FDFAF5',
  cremeDeep: '#F7F1E6',
  bord: '#E8E0D4',
  bordSoft: '#F0EAE0',
  white: '#FFFFFF',
}

const HeartFill = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
)
const BellIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
)

export default function FavorisView({ events, onToggleFav, onOpenProducer, onOpenEtablissement, onBack }: Props) {
  const { user, loading: authLoading } = useAuth()
  const [filter, setFilter] = useState<Filter>('annonces')

  // SWR + authedFetcher — pattern validé sur MurTab. Clé null tant que la
  // session n'est pas prête → pas de race. 1 fetch HTTP regroupe les 4
  // anciennes queries (favorites + followers × producers + etabs).
  const favKey = !authLoading && user ? '/api/favoris' : null
  const { data, isLoading, mutate } = useSWR<{
    producerFavs: ProducerMin[]; producerFollows: ProducerMin[];
    etabFavs: EtabMin[]; etabFollows: EtabMin[];
  }>(favKey, authedFetcher)
  const producerFavs    = data?.producerFavs    ?? []
  const producerFollows = data?.producerFollows ?? []
  const etabFavs        = data?.etabFavs        ?? []
  const etabFollows     = data?.etabFollows     ?? []
  const loading = isLoading && !data

  // Helpers d'optimistic unfollow : update du cache SWR sans flash UI.
  // mutate(updater, false) → bascule l'UI puis on déclenche une revalidation.
  const removeProducerFav = (id: string) =>
    mutate(prev => prev ? { ...prev, producerFavs: prev.producerFavs.filter(x => x.id !== id) } : prev, false)
  const removeEtabFav = (id: string) =>
    mutate(prev => prev ? { ...prev, etabFavs: prev.etabFavs.filter(x => x.id !== id) } : prev, false)
  const removeProducerFollow = (id: string) =>
    mutate(prev => prev ? { ...prev, producerFollows: prev.producerFollows.filter(x => x.id !== id) } : prev, false)
  const removeEtabFollow = (id: string) =>
    mutate(prev => prev ? { ...prev, etabFollows: prev.etabFollows.filter(x => x.id !== id) } : prev, false)

  // Favoris annonces : hook hybride + fetch liste publique pour hydrater.
  // Le toggle (retrait) se fait via le cœur de AnnonceCard directement.
  const { favIds: annonceFavIds } = useAnnonceFavorites()
  const { data: annoncesData } = useSWR<{ annonces: Annonce[] }>(
    user && annonceFavIds.length > 0 ? '/api/annonces/public' : null,
  )
  const annonceFavs = useMemo(
    () => ((annoncesData?.annonces ?? []) as Annonce[]).filter(a => annonceFavIds.includes(a.id)),
    [annoncesData, annonceFavIds],
  )

  // Compteurs par filtre (affichés en pastille dans les pills)
  const counts: Record<Filter, number> = {
    annonces:    annonceFavs.length,
    events:      events.length,
    producteurs: producerFavs.length,
    commerces:   etabFavs.length,
    suivis:      producerFollows.length + etabFollows.length,
  }
  const totalCount = counts.annonces + counts.events + counts.producteurs + counts.commerces + counts.suivis

  return (
    <div style={{ minHeight: '100%', backgroundColor: T.creme, fontFamily: 'Inter, sans-serif', color: T.texte }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '14px 16px 0' }}>
        {onBack ? (
          <button
            onClick={onBack}
            style={{ width: 40, height: 40, borderRadius: 12, background: T.white, border: `1px solid ${T.bord}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.texte, boxShadow: '0 1px 2px rgba(44,28,16,0.04)', cursor: 'pointer', flexShrink: 0 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
        ) : <div style={{ width: 40, flexShrink: 0 }} />}
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif', fontSize: 22, lineHeight: 1.1, color: T.texte, letterSpacing: '-0.01em' }}>
            Mes favoris
          </div>
        </div>
        <div style={{ width: 40, flexShrink: 0 }} />
      </div>

      {/* Filter pills V3 — scrollable horizontalement (style page Annonces) */}
      <style>{`.pdv-favoris-hscroll { scrollbar-width: none; -webkit-overflow-scrolling: touch; } .pdv-favoris-hscroll::-webkit-scrollbar { display: none; }`}</style>
      <div
        className="pdv-favoris-hscroll"
        style={{
          display: 'flex', gap: 6, padding: '14px 16px 4px',
          overflowX: 'auto', scrollSnapType: 'x mandatory',
        }}
      >
        {FILTERS.map(f => {
          const active = filter === f.id
          const c = counts[f.id]
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              style={{
                flexShrink: 0, whiteSpace: 'nowrap',
                borderRadius: 999, padding: '8px 14px',
                fontSize: 12, fontWeight: 700,
                border: '1.5px solid',
                background:  active ? T.texte : T.white,
                borderColor: active ? T.texte : T.bord,
                color:       active ? T.white : T.texteDoux,
                scrollSnapAlign: 'center', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}
            >
              {f.label}
              {c > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 800,
                  padding: '1px 6px', borderRadius: 999,
                  background: active ? 'rgba(255,255,255,0.18)' : T.cremeDeep,
                  color:      active ? T.white : T.texteDoux,
                  lineHeight: 1.4,
                }}>{c}</span>
              )}
            </button>
          )
        })}
      </div>

      <div style={{ padding: '14px 14px 56px' }}>
        {!user && (
          <EmptyState icon="🔒" title="Connexion requise" sub="Connecte-toi pour voir tes favoris et suivis" />
        )}

        {user && loading && <Spinner />}

        {user && !loading && totalCount === 0 && (
          <EmptyState
            icon="🤍"
            title="Aucun favori"
            sub="Appuie sur ❤️ pour mettre en favori une annonce, un événement, un producteur ou un commerce."
          />
        )}

        {user && !loading && totalCount > 0 && (
          <>
            {/* ── ANNONCES — grid 2-col, AnnonceCard (identique page annonces) ── */}
            {filter === 'annonces' && (
              annonceFavs.length === 0 ? (
                <EmptyState icon="🤍" title="Aucune annonce favorite" sub="Appuie sur ❤️ sur une annonce pour la retrouver ici." />
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  {annonceFavs.map(a => <AnnonceCard key={a.id} annonce={a} />)}
                </div>
              )
            )}

            {/* ── ÉVÉNEMENTS — liste verticale ─────────────────────── */}
            {filter === 'events' && (
              events.length === 0 ? (
                <EmptyState icon="🤍" title="Aucun événement favori" sub="Appuie sur ❤️ sur un événement pour le retrouver ici." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {events.map(evt => <FavCard key={evt.id} evt={evt} onRemove={() => onToggleFav(evt.id)} />)}
                </div>
              )
            )}

            {/* ── PRODUCTEURS — liste verticale ─────────────────────── */}
            {filter === 'producteurs' && (
              producerFavs.length === 0 ? (
                <EmptyState icon="🤍" title="Aucun producteur favori" sub="Appuie sur ❤️ sur un producteur pour le retrouver ici." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {producerFavs.map(p => (
                    <ProducerCard key={p.id} p={p}
                      onClick={() => onOpenProducer?.(p.id)}
                      onRemove={async () => {
                        await supabase.from('producer_favorites').delete().eq('producer_id', p.id).eq('user_id', user!.id)
                        removeProducerFav(p.id)
                      }} />
                  ))}
                </div>
              )
            )}

            {/* ── COMMERCES — liste verticale ────────────────────────── */}
            {filter === 'commerces' && (
              etabFavs.length === 0 ? (
                <EmptyState icon="🤍" title="Aucun commerce favori" sub="Appuie sur ❤️ sur un commerce pour le retrouver ici." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {etabFavs.map(e => (
                    <EtabCard key={e.id} e={e}
                      onClick={() => onOpenEtablissement?.(e.id)}
                      onRemove={async () => {
                        await supabase.from('etablissement_favorites').delete().eq('etablissement_id', e.id).eq('user_id', user!.id)
                        removeEtabFav(e.id)
                      }} />
                  ))}
                </div>
              )
            )}

            {/* ── SUIVIS — producers + etabs followers en liste mixte ─ */}
            {filter === 'suivis' && (
              counts.suivis === 0 ? (
                <EmptyState icon="📭" title="Aucun abonnement" sub="Suis des producteurs et commerces pour ne rien rater." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {producerFollows.map(p => (
                    <FollowCard key={p.id} type="producteur" name={p.nom} meta={p.commune ?? ''} photo={p.photos[0]}
                      onClick={() => onOpenProducer?.(p.id)}
                      onRemove={async () => {
                        await supabase.from('producer_followers').delete().eq('producer_id', p.id).eq('user_id', user!.id)
                        removeProducerFollow(p.id)
                      }} />
                  ))}
                  {etabFollows.map(e => {
                    const typeInfo = ETAB_TYPES[e.type as keyof typeof ETAB_TYPES]
                    return (
                      <FollowCard key={e.id} type="etab" name={e.nom} meta={`${typeInfo?.label ?? ''}${e.commune ? ' · ' + e.commune : ''}`} photo={e.photos[0]}
                        onClick={() => onOpenEtablissement?.(e.id)}
                        onRemove={async () => {
                          await supabase.from('etablissement_followers').delete().eq('etablissement_id', e.id).eq('user_id', user!.id)
                          removeEtabFollow(e.id)
                        }} />
                    )
                  })}
                </div>
              )
            )}
          </>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function EmptyState({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '52px 20px 20px' }}>
      <div style={{ fontSize: 54, marginBottom: 14 }}>{icon}</div>
      <p style={{ fontWeight: 700, fontSize: 16, color: T.texte, margin: '0 0 6px' }}>{title}</p>
      <p style={{ fontSize: 13, color: T.texteDoux, margin: 0, lineHeight: 1.55 }}>{sub}</p>
    </div>
  )
}

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
      <div style={{ width: 26, height: 26, borderRadius: '50%', border: `3px solid ${T.bord}`, borderTopColor: T.primary, animation: 'spin 0.7s linear infinite' }} />
    </div>
  )
}

function ProducerCard({ p, onClick, onRemove }: { p: ProducerMin; onClick: () => void; onRemove: () => void }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', height: 90, borderRadius: 14, overflow: 'hidden', background: T.white, boxShadow: '0 1px 6px rgba(44,28,16,0.06)', border: `1px solid ${T.bordSoft}`, position: 'relative', cursor: 'pointer' }}>
      <div style={{ width: 90, flexShrink: 0, background: '#E8F2EB', position: 'relative', overflow: 'hidden' }}>
        {p.photos[0] ? <img src={p.photos[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>🌿</div>}
      </div>
      <div style={{ flex: 1, padding: '10px 44px 10px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 9, fontWeight: 800, color: T.primary, background: T.primaryLight, padding: '2px 7px', borderRadius: 999, letterSpacing: '0.04em' }}>PRODUCTEUR</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.texte, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nom}</div>
        </div>
        <div style={{ fontSize: 11, color: T.texteDoux, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {p.commune ?? ''}{p.produit_categories.length > 0 && p.commune ? ' · ' : ''}{p.produit_categories.slice(0, 2).map(c => PRODUIT_CATS_MAP[c]?.label ?? c).join(', ')}
        </div>
      </div>
      <button onClick={e => { e.stopPropagation(); onRemove() }}
        style={{ position: 'absolute', top: 10, right: 10, width: 28, height: 28, borderRadius: 8, background: 'rgba(232,242,235,0.5)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.accent }}>
        <HeartFill size={13} />
      </button>
    </div>
  )
}

function EtabCard({ e, onClick, onRemove }: { e: EtabMin; onClick: () => void; onRemove: () => void }) {
  const typeInfo = ETAB_TYPES[e.type as keyof typeof ETAB_TYPES]
  return (
    <div onClick={onClick} style={{ display: 'flex', height: 90, borderRadius: 14, overflow: 'hidden', background: T.white, boxShadow: '0 1px 6px rgba(44,28,16,0.06)', border: `1px solid ${T.bordSoft}`, position: 'relative', cursor: 'pointer' }}>
      <div style={{ width: 90, flexShrink: 0, background: typeInfo?.bg ?? '#FDE8DF', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {e.photos[0] ? <img src={e.photos[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" /> : <span style={{ fontSize: 30 }}>{typeInfo?.emoji ?? '🏪'}</span>}
      </div>
      <div style={{ flex: 1, padding: '10px 44px 10px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 9, fontWeight: 800, color: '#C0440A', background: '#FDE8DF', padding: '2px 7px', borderRadius: 999, letterSpacing: '0.04em' }}>COMMERCE</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.texte, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.nom}</div>
        </div>
        <div style={{ fontSize: 11, color: T.texteDoux, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {typeInfo?.label ?? e.type}{e.commune ? ` · ${e.commune}` : ''}
        </div>
      </div>
      <button onClick={ev => { ev.stopPropagation(); onRemove() }}
        style={{ position: 'absolute', top: 10, right: 10, width: 28, height: 28, borderRadius: 8, background: 'rgba(232,242,235,0.5)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.accent }}>
        <HeartFill size={13} />
      </button>
    </div>
  )
}

function FollowCard({ type, name, meta, photo, onClick, onRemove }: { type: 'producteur' | 'etab'; name: string; meta: string; photo?: string; onClick: () => void; onRemove: () => void }) {
  const palette = type === 'producteur'
    ? { color: T.primary, tint: T.primaryLight, label: 'PRODUCTEUR', emoji: '🌿' }
    : { color: '#C0440A', tint: '#FDE8DF', label: 'COMMERCE', emoji: '🏪' }
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 12, background: T.white, border: `1px solid ${T.bordSoft}`, borderRadius: 14, padding: '10px 12px 10px 10px', boxShadow: '0 1px 6px rgba(44,28,16,0.06)', position: 'relative', cursor: 'pointer' }}>
      <div style={{ width: 54, height: 54, borderRadius: 12, flexShrink: 0, background: palette.tint, overflow: 'hidden', position: 'relative' }}>
        {photo ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>{palette.emoji}</div>}
        <span style={{ position: 'absolute', bottom: -3, right: -3, width: 22, height: 22, borderRadius: '50%', background: T.primary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${T.white}` }}>
          <BellIcon size={10} />
        </span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 9, fontWeight: 800, color: palette.color, letterSpacing: '0.04em' }}>{palette.label}</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.texte, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        <div style={{ fontSize: 11, color: T.texteDoux, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>{meta}</div>
      </div>
      <button onClick={e => { e.stopPropagation(); onRemove() }}
        style={{ width: 28, height: 28, borderRadius: 8, background: 'transparent', border: `1px solid ${T.bord}`, color: T.texteDoux, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        aria-label="Retirer">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
      </button>
    </div>
  )
}

function FavCard({ evt, onRemove }: { evt: EvenementCard; onRemove: () => void }) {
  const cat = CATEGORIES[evt.categorie] ?? CATEGORIES.autre
  return (
    <Link href={`/evenement/${evt.id}`} style={{ display: 'block', position: 'relative', height: 120, borderRadius: 14, overflow: 'hidden', textDecoration: 'none', boxShadow: '0 1px 6px rgba(44,28,16,0.06)', border: `1px solid ${T.bordSoft}` }}>
      {evt.image_url
        ? <img src={evt.image_url} alt={evt.titre} loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: evt.image_position ?? '50% 50%' }} />
        : <div style={{ position: 'absolute', inset: 0, backgroundColor: cat.color }} />}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.42) 50%, rgba(0,0,0,0.06) 82%)' }} />
      <span style={{ position: 'absolute', top: 11, left: 12, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 800, backgroundColor: cat.color, color: '#fff', borderRadius: 999, padding: '3px 9px' }}>
        {cat.emoji} {cat.label}
      </span>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '10px 48px 13px 14px' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#fff', lineHeight: 1.3, margin: '0 0 3px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{evt.titre}</h3>
        {evt.date_debut && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.72)', margin: 0 }}>{formatEventDate(evt.date_debut, evt.date_fin)}{evt.heure && !evt.date_fin ? ` · ${evt.heure.slice(0, 5)}` : ''}{evt.lieux?.commune ? ` • ${evt.lieux.commune}` : ''}</p>}
      </div>
      <button onClick={e => { e.preventDefault(); e.stopPropagation(); onRemove() }}
        style={{ position: 'absolute', bottom: 11, right: 12, width: 30, height: 30, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.48)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', color: T.accent }}>
        <HeartFill size={14} />
      </button>
    </Link>
  )
}
