'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { EvenementCard } from '@/lib/types'
import { CATEGORIES } from '@/lib/categories'
import { formatDate } from '@/lib/filters'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PRODUIT_CATS_MAP, normalizeProduitCat } from '@/lib/produit-cats'

interface ProducerMin {
  id: string; nom: string; commune: string | null; photos: string[]; produit_categories: string[]
}

interface Props {
  events: EvenementCard[]
  onToggleFav: (id: string) => void
  onOpenProducer?: (id: string) => void
}

type Tab = 'events' | 'producers' | 'follows'

const TABS: { id: Tab; emoji: string; label: string }[] = [
  { id: 'events',    emoji: '🗓', label: 'Événements' },
  { id: 'producers', emoji: '❤️', label: 'Producteurs' },
  { id: 'follows',   emoji: '🌿', label: 'Suivis' },
]

export default function FavorisView({ events, onToggleFav, onOpenProducer }: Props) {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('events')
  const [producerFavs, setProducerFavs] = useState<ProducerMin[]>([])
  const [producerFollows, setProducerFollows] = useState<ProducerMin[]>([])
  const [loadingProducers, setLoadingProducers] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (tab === 'events' || !user || loaded) return
    setLoadingProducers(true)

    async function fetchByTable(table: 'producer_favorites' | 'producer_followers') {
      const { data: rows } = await supabase.from(table).select('producer_id').eq('user_id', user!.id)
      const ids = (rows ?? []).map((r: { producer_id: string }) => r.producer_id)
      if (ids.length === 0) return []
      const { data } = await supabase.from('producers').select('id, nom, commune, photos, products(categorie, disponible)').in('id', ids)
      return (data ?? []).map((p: { id: string; nom: string; commune: string | null; photos: string[] | null; products: { categorie: string; disponible: boolean }[] | null }) => ({
        id: p.id, nom: p.nom, commune: p.commune, photos: p.photos ?? [],
        produit_categories: Array.from(new Set((p.products ?? []).filter(pr => pr.disponible).map(pr => normalizeProduitCat(pr.categorie)))),
      }))
    }

    Promise.all([fetchByTable('producer_favorites'), fetchByTable('producer_followers')])
      .then(([favs, follows]) => { setProducerFavs(favs); setProducerFollows(follows); setLoaded(true) })
      .finally(() => setLoadingProducers(false))
  }, [tab, user, loaded])

  return (
    <div style={{ minHeight: '100%', backgroundColor: '#F5F0E8', fontFamily: 'Inter, sans-serif' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(140deg, #2D5A3D 0%, #3E7A55 100%)', padding: '22px 18px 62px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', right: -30, top: -30, width: 200, height: 200, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.05)' }} />
        <div style={{ position: 'absolute', right: 60, top: 55, width: 100, height: 100, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.07)' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>❤️</div>
          <h1 style={{ fontWeight: 800, fontSize: 22, color: '#fff', margin: '0 0 5px' }}>Mes favoris</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', margin: 0 }}>Événements et producteurs sauvegardés</p>
        </div>
      </div>

      {/* Tabs flottants */}
      <div style={{ margin: '-30px 14px 0', backgroundColor: '#fff', borderRadius: 18, boxShadow: '0 6px 28px rgba(0,0,0,0.13)', display: 'flex', gap: 4, padding: 4, position: 'relative', zIndex: 2 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: '10px 4px', borderRadius: 14, border: 'none',
            backgroundColor: tab === t.id ? '#2D5A3D' : 'transparent',
            color: tab === t.id ? '#fff' : '#8A8A8A',
            fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
            transition: 'all 0.15s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          }}>
            <span style={{ fontSize: 17 }}>{t.emoji}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Contenu */}
      <div style={{ padding: '14px 14px 56px' }}>
        {tab === 'events' && (
          events.length === 0
            ? <EmptyState icon="🤍" title="Aucun événement favori" sub="Appuie sur ❤️ pour sauvegarder des événements" />
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {events.map(evt => <FavCard key={evt.id} evt={evt} onRemove={() => onToggleFav(evt.id)} />)}
              </div>
        )}

        {tab === 'producers' && (
          !user
            ? <EmptyState icon="🔒" title="Connexion requise" sub="Connecte-toi pour voir tes producteurs favoris" />
            : loadingProducers
            ? <Spinner />
            : producerFavs.length === 0
            ? <EmptyState icon="🌿" title="Aucun producteur favori" sub="Appuie sur ❤️ sur une fiche producteur" />
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {producerFavs.map(p => (
                  <ProducerCard key={p.id} p={p} accentColor="#EC407A"
                    onClick={() => onOpenProducer?.(p.id)}
                    onRemove={async () => {
                      await supabase.from('producer_favorites').delete().eq('producer_id', p.id).eq('user_id', user.id)
                      setProducerFavs(prev => prev.filter(x => x.id !== p.id))
                    }} />
                ))}
              </div>
        )}

        {tab === 'follows' && (
          !user
            ? <EmptyState icon="🔒" title="Connexion requise" sub="Connecte-toi pour voir tes abonnements" />
            : loadingProducers
            ? <Spinner />
            : producerFollows.length === 0
            ? <EmptyState icon="📭" title="Aucun abonnement" sub="Suis des producteurs pour ne rien rater" />
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {producerFollows.map(p => (
                  <ProducerCard key={p.id} p={p} accentColor="#2D5A3D"
                    onClick={() => onOpenProducer?.(p.id)}
                    onRemove={async () => {
                      await supabase.from('producer_followers').delete().eq('producer_id', p.id).eq('user_id', user.id)
                      setProducerFollows(prev => prev.filter(x => x.id !== p.id))
                    }} />
                ))}
              </div>
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
      <p style={{ fontWeight: 700, fontSize: 16, color: '#2C1810', margin: '0 0 6px', fontFamily: 'Inter, sans-serif' }}>{title}</p>
      <p style={{ fontSize: 13, color: '#8A8A8A', margin: 0, lineHeight: 1.55, fontFamily: 'Inter, sans-serif' }}>{sub}</p>
    </div>
  )
}

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
      <div style={{ width: 26, height: 26, borderRadius: '50%', border: '3px solid #E0D8CE', borderTopColor: '#2D5A3D', animation: 'spin 0.7s linear infinite' }} />
    </div>
  )
}

function ProducerCard({ p, onClick, onRemove, accentColor }: {
  p: ProducerMin; onClick: () => void; onRemove: () => void; accentColor: string
}) {
  return (
    <div onClick={onClick} style={{ backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(44,28,16,0.08)', display: 'flex', height: 90, cursor: 'pointer', position: 'relative' }}>
      {/* Photo */}
      <div style={{ width: 90, flexShrink: 0, backgroundColor: '#E8F2EB', overflow: 'hidden' }}>
        {p.photos[0]
          ? <img src={p.photos[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>🌿</div>}
      </div>
      {/* Infos */}
      <div style={{ flex: 1, padding: '13px 46px 13px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, minWidth: 0 }}>
        <p style={{ fontWeight: 700, fontSize: 14, color: '#1C1917', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'Inter, sans-serif' }}>{p.nom}</p>
        {p.commune && <p style={{ fontSize: 11, color: '#6B5E4E', margin: 0, fontFamily: 'Lora, serif' }}>📍 {p.commune}</p>}
        {p.produit_categories.length > 0 && (
          <div style={{ display: 'flex', gap: 4, overflow: 'hidden' }}>
            {p.produit_categories.slice(0, 2).map(c => {
              const cat = PRODUIT_CATS_MAP[c]
              return cat ? (
                <span key={c} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, backgroundColor: '#E8F2EB', color: '#2D5A3D', fontWeight: 700, fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' }}>
                  {cat.emoji} {cat.label}
                </span>
              ) : null
            })}
          </div>
        )}
      </div>
      {/* Bouton retirer */}
      <button onClick={e => { e.stopPropagation(); onRemove() }}
        style={{ position: 'absolute', top: 10, right: 10, width: 30, height: 30, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.05)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill={accentColor} stroke={accentColor} strokeWidth="1.5">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
      </button>
    </div>
  )
}

function FavCard({ evt, onRemove }: { evt: EvenementCard; onRemove: () => void }) {
  const cat = CATEGORIES[evt.categorie] ?? CATEGORIES.autre
  return (
    <Link href={`/evenement/${evt.id}`} style={{ display: 'block', position: 'relative', height: 120, borderRadius: 18, overflow: 'hidden', textDecoration: 'none', boxShadow: '0 3px 14px rgba(44,44,44,0.11)' }}>
      {evt.image_url
        ? <img src={evt.image_url} alt={evt.titre} loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: evt.image_position ?? '50% 50%' }} />
        : <div style={{ position: 'absolute', inset: 0, backgroundColor: cat.color }} />}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.42) 50%, rgba(0,0,0,0.06) 82%)' }} />
      <span style={{ position: 'absolute', top: 11, left: 12, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 800, backgroundColor: cat.color, color: '#fff', borderRadius: 999, padding: '3px 9px' }}>
        {cat.emoji} {cat.label}
      </span>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '10px 48px 13px 14px' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#fff', fontFamily: 'Inter, sans-serif', lineHeight: 1.3, margin: '0 0 3px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{evt.titre}</h3>
        {evt.date_debut && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.72)', margin: 0 }}>{formatDate(evt.date_debut)}{evt.heure ? ` · ${evt.heure.slice(0, 5)}` : ''}{evt.lieux?.commune ? ` • ${evt.lieux.commune}` : ''}</p>}
      </div>
      <button onClick={e => { e.preventDefault(); e.stopPropagation(); onRemove() }}
        style={{ position: 'absolute', bottom: 11, right: 12, width: 30, height: 30, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.48)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="#EC407A" stroke="#EC407A" strokeWidth="1.5">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
      </button>
    </Link>
  )
}
