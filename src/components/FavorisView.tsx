'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { EvenementCard } from '@/lib/types'
import { CATEGORIES } from '@/lib/categories'
import { formatEventDate } from '@/lib/filters'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PRODUIT_CATS_MAP, normalizeProduitCat } from '@/lib/produit-cats'
import { ETAB_TYPES } from '@/lib/etablissement-types'

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

type Tab = 'likes' | 'suivis'

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
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('likes')
  const [producerFavs, setProducerFavs] = useState<ProducerMin[]>([])
  const [producerFollows, setProducerFollows] = useState<ProducerMin[]>([])
  const [etabFavs, setEtabFavs] = useState<EtabMin[]>([])
  const [etabFollows, setEtabFollows] = useState<EtabMin[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!user || loaded) return
    setLoading(true)

    async function fetchProducers(table: 'producer_favorites' | 'producer_followers') {
      const { data: rows } = await supabase.from(table).select('producer_id').eq('user_id', user!.id)
      const ids = (rows ?? []).map((r: { producer_id: string }) => r.producer_id)
      if (ids.length === 0) return []
      const { data } = await supabase.from('producers').select('id, nom, commune, photos, products(categorie, disponible)').in('id', ids)
      return (data ?? []).map((p: { id: string; nom: string; commune: string | null; photos: string[] | null; products: { categorie: string; disponible: boolean }[] | null }) => ({
        id: p.id, nom: p.nom, commune: p.commune, photos: p.photos ?? [],
        produit_categories: Array.from(new Set((p.products ?? []).filter(pr => pr.disponible).map(pr => normalizeProduitCat(pr.categorie)))),
      }))
    }

    async function fetchEtabs(table: 'etablissement_favorites' | 'etablissement_followers') {
      const { data: rows } = await supabase.from(table).select('etablissement_id').eq('user_id', user!.id)
      const ids = (rows ?? []).map((r: { etablissement_id: string }) => r.etablissement_id)
      if (ids.length === 0) return []
      const { data } = await supabase.from('etablissements').select('id, nom, commune, photos, type').in('id', ids)
      return (data ?? []).map((e: { id: string; nom: string; commune: string | null; photos: string[] | null; type: string }) => ({
        id: e.id, nom: e.nom, commune: e.commune, photos: e.photos ?? [], type: e.type,
      }))
    }

    Promise.all([
      fetchProducers('producer_favorites'),
      fetchProducers('producer_followers'),
      fetchEtabs('etablissement_favorites'),
      fetchEtabs('etablissement_followers'),
    ])
      .then(([pFavs, pFollows, eFavs, eFollows]) => {
        setProducerFavs(pFavs); setProducerFollows(pFollows)
        setEtabFavs(eFavs); setEtabFollows(eFollows)
        setLoaded(true)
      })
      .finally(() => setLoading(false))
  }, [user, loaded])

  const likesCount = events.length + producerFavs.length + etabFavs.length
  const suivisCount = producerFollows.length + etabFollows.length

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

      {/* Tabs segmented */}
      <div style={{ padding: '14px 16px 4px' }}>
        <div style={{ display: 'flex', gap: 4, padding: 4, background: T.cremeDeep, borderRadius: 14 }}>
          {([
            { id: 'likes', label: 'Coups de cœur', icon: <HeartFill />, count: likesCount, color: T.accent },
            { id: 'suivis', label: 'Suivis', icon: <BellIcon />, count: suivisCount, color: T.primary },
          ] as { id: Tab; label: string; icon: React.ReactNode; count: number; color: string }[]).map(t => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  flex: 1, padding: '10px 8px', border: 'none', cursor: 'pointer', borderRadius: 10,
                  background: active ? T.white : 'transparent',
                  color: active ? T.texte : T.texteDoux,
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 13, fontWeight: active ? 800 : 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  boxShadow: active ? '0 1px 3px rgba(44,28,16,0.08)' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ color: active ? t.color : T.texteDoux }}>{t.icon}</span>
                <span>{t.label}</span>
                {t.count > 0 && (
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    color: active ? T.texteDoux : T.texteTresDoux,
                    background: active ? T.cremeDeep : 'transparent',
                    padding: '1px 6px', borderRadius: 999,
                  }}>{t.count}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ padding: '14px 14px 56px' }}>
        {!user && (
          <EmptyState icon="🔒" title="Connexion requise" sub="Connecte-toi pour voir tes favoris et suivis" />
        )}

        {/* TAB COUPS DE CŒUR */}
        {user && tab === 'likes' && (
          <>
            {loading ? <Spinner /> : likesCount === 0 ? (
              <EmptyState icon="🤍" title="Aucun coup de cœur" sub="Appuie sur ❤️ sur un événement, un commerce ou un producteur" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {events.length > 0 && (
                  <Section title="Événements" count={events.length}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {events.map(evt => <FavCard key={evt.id} evt={evt} onRemove={() => onToggleFav(evt.id)} />)}
                    </div>
                  </Section>
                )}
                {producerFavs.length > 0 && (
                  <Section title="Producteurs" count={producerFavs.length}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {producerFavs.map(p => (
                        <ProducerCard key={p.id} p={p}
                          onClick={() => onOpenProducer?.(p.id)}
                          onRemove={async () => {
                            await supabase.from('producer_favorites').delete().eq('producer_id', p.id).eq('user_id', user!.id)
                            setProducerFavs(prev => prev.filter(x => x.id !== p.id))
                          }} />
                      ))}
                    </div>
                  </Section>
                )}
                {etabFavs.length > 0 && (
                  <Section title="Commerces & lieux" count={etabFavs.length}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {etabFavs.map(e => (
                        <EtabCard key={e.id} e={e}
                          onClick={() => onOpenEtablissement?.(e.id)}
                          onRemove={async () => {
                            await supabase.from('etablissement_favorites').delete().eq('etablissement_id', e.id).eq('user_id', user!.id)
                            setEtabFavs(prev => prev.filter(x => x.id !== e.id))
                          }} />
                      ))}
                    </div>
                  </Section>
                )}
              </div>
            )}
          </>
        )}

        {/* TAB SUIVIS */}
        {user && tab === 'suivis' && (
          <>
            {loading ? <Spinner /> : suivisCount === 0 ? (
              <EmptyState icon="📭" title="Aucun abonnement" sub="Suis des producteurs et commerces pour ne rien rater" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {producerFollows.length > 0 && (
                  <Section title="Producteurs" count={producerFollows.length}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {producerFollows.map(p => (
                        <FollowCard key={p.id} type="producteur" name={p.nom} meta={p.commune ?? ''} photo={p.photos[0]}
                          onClick={() => onOpenProducer?.(p.id)}
                          onRemove={async () => {
                            await supabase.from('producer_followers').delete().eq('producer_id', p.id).eq('user_id', user!.id)
                            setProducerFollows(prev => prev.filter(x => x.id !== p.id))
                          }} />
                      ))}
                    </div>
                  </Section>
                )}
                {etabFollows.length > 0 && (
                  <Section title="Commerces & lieux" count={etabFollows.length}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {etabFollows.map(e => {
                        const typeInfo = ETAB_TYPES[e.type as keyof typeof ETAB_TYPES]
                        return (
                          <FollowCard key={e.id} type="etab" name={e.nom} meta={`${typeInfo?.label ?? ''}${e.commune ? ' · ' + e.commune : ''}`} photo={e.photos[0]}
                            onClick={() => onOpenEtablissement?.(e.id)}
                            onRemove={async () => {
                              await supabase.from('etablissement_followers').delete().eq('etablissement_id', e.id).eq('user_id', user!.id)
                              setEtabFollows(prev => prev.filter(x => x.id !== e.id))
                            }} />
                        )
                      })}
                    </div>
                  </Section>
                )}
              </div>
            )}
          </>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, padding: '0 2px' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: T.texteDoux, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{title}</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.texteTresDoux }}>{count}</div>
      </div>
      {children}
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
