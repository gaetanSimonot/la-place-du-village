'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { EvenementCard } from '@/lib/types'
import { CATEGORIES } from '@/lib/categories'
import { formatDate } from '@/lib/filters'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PRODUIT_CATS_MAP } from '@/lib/produit-cats'

interface ProducerMin {
  id: string; nom: string; commune: string | null; photos: string[]; produit_categories: string[]
}

interface Props {
  events: EvenementCard[]
  onToggleFav: (id: string) => void
}

type Tab = 'events' | 'producers' | 'follows'

export default function FavorisView({ events, onToggleFav }: Props) {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('events')
  const [producerFavs, setProducerFavs] = useState<ProducerMin[]>([])
  const [producerFollows, setProducerFollows] = useState<ProducerMin[]>([])
  const [loadingProducers, setLoadingProducers] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (tab === 'events' || !user || loaded) return
    setLoadingProducers(true)

    async function fetchByTable(table: 'producer_favorites' | 'producer_follows') {
      const { data: rows } = await supabase.from(table).select('producer_id').eq('user_id', user!.id)
      const ids = (rows ?? []).map((r: { producer_id: string }) => r.producer_id)
      if (ids.length === 0) return []
      const { data } = await supabase.from('producers').select('id, nom, commune, photos, products(categorie, disponible)').in('id', ids)
      return (data ?? []).map((p: { id: string; nom: string; commune: string | null; photos: string[] | null; products: { categorie: string; disponible: boolean }[] | null }) => ({
        id: p.id, nom: p.nom, commune: p.commune, photos: p.photos ?? [],
        produit_categories: Array.from(new Set((p.products ?? []).filter(pr => pr.disponible).map(pr => pr.categorie))),
      }))
    }

    Promise.all([fetchByTable('producer_favorites'), fetchByTable('producer_follows')])
      .then(([favs, follows]) => { setProducerFavs(favs); setProducerFollows(follows); setLoaded(true) })
      .finally(() => setLoadingProducers(false))
  }, [tab, user, loaded])

  const TabBtn = ({ id, label }: { id: Tab; label: string }) => (
    <button onClick={() => setTab(id)} style={{ flex: 1, padding: '10px 0', border: 'none', borderBottom: `2.5px solid ${tab === id ? '#2D5A3D' : 'transparent'}`, backgroundColor: 'transparent', fontWeight: tab === id ? 700 : 600, fontSize: 13, color: tab === id ? '#2D5A3D' : '#8A8A8A', cursor: 'pointer', fontFamily: 'Inter, sans-serif', transition: 'color 0.15s' }}>
      {label}
    </button>
  )

  const Spinner = () => (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
      <div style={{ width: 24, height: 24, borderRadius: '50%', border: '3px solid #E0D8CE', borderTopColor: '#2D5A3D', animation: 'spin 0.7s linear infinite' }} />
    </div>
  )

  const Empty = ({ icon, text }: { icon: string; text: string }) => (
    <div style={{ textAlign: 'center', paddingTop: 60 }}>
      <p style={{ fontSize: 48, marginBottom: 12 }}>{icon}</p>
      <p style={{ fontWeight: 700, fontSize: 16, color: '#2C1810', marginBottom: 6, fontFamily: 'Inter, sans-serif' }}>{text}</p>
    </div>
  )

  const ProducerCard = ({ p, onRemove }: { p: ProducerMin; onRemove: () => void }) => (
    <Link href={`/producteur/${p.id}`} style={{ display: 'flex', gap: 12, padding: '12px 0', textDecoration: 'none', borderBottom: '1px solid #EDE8E0', alignItems: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: 10, backgroundColor: '#E8F2EB', flexShrink: 0, overflow: 'hidden' }}>
        {p.photos[0]
          ? <img src={p.photos[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🌿</div>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontWeight: 700, fontSize: 14, color: '#2C1810', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'Inter, sans-serif' }}>{p.nom}</p>
        {p.commune && <p style={{ fontSize: 12, color: '#6B5E4E', margin: 0, fontFamily: 'Lora, serif' }}>📍 {p.commune}</p>}
        <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
          {p.produit_categories.slice(0, 2).map(c => {
            const cat = PRODUIT_CATS_MAP[c]
            return cat ? <span key={c} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 999, backgroundColor: '#E8F2EB', color: '#2D5A3D', fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>{cat.emoji} {cat.label}</span> : null
          })}
        </div>
      </div>
      <button onClick={e => { e.preventDefault(); e.stopPropagation(); onRemove() }}
        style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.05)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="#EC407A" stroke="#EC407A" strokeWidth="1.5">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
      </button>
    </Link>
  )

  return (
    <div style={{ minHeight: '100%', backgroundColor: 'var(--creme)', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#fff', borderBottom: '1px solid #EDE8E0' }}>
        <div style={{ padding: '12px 16px 0' }}>
          <h1 style={{ fontWeight: 700, fontSize: 18, color: '#2C1810', margin: '0 0 10px' }}>Mes favoris</h1>
        </div>
        <div style={{ display: 'flex', borderBottom: '1px solid #EDE8E0' }}>
          <TabBtn id="events" label="🗓 Événements" />
          <TabBtn id="producers" label="❤️ Producteurs" />
          <TabBtn id="follows" label="🌿 Suivis" />
        </div>
      </div>

      <div style={{ padding: '16px 16px 40px' }}>
        {tab === 'events' && (
          events.length === 0
            ? <Empty icon="🤍" text="Aucun événement favori" />
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{events.map(evt => <FavCard key={evt.id} evt={evt} onRemove={() => onToggleFav(evt.id)} />)}</div>
        )}

        {tab === 'producers' && (
          !user ? <Empty icon="🔒" text="Connecte-toi pour voir tes producteurs favoris" />
          : loadingProducers ? <Spinner />
          : producerFavs.length === 0 ? <Empty icon="🌿" text="Aucun producteur favori" />
          : producerFavs.map(p => (
            <ProducerCard key={p.id} p={p} onRemove={async () => {
              await supabase.from('producer_favorites').delete().eq('producer_id', p.id).eq('user_id', user.id)
              setProducerFavs(prev => prev.filter(x => x.id !== p.id))
            }} />
          ))
        )}

        {tab === 'follows' && (
          !user ? <Empty icon="🔒" text="Connecte-toi pour voir tes abonnements" />
          : loadingProducers ? <Spinner />
          : producerFollows.length === 0 ? <Empty icon="📭" text="Aucun abonnement pour l'instant" />
          : producerFollows.map(p => (
            <ProducerCard key={p.id} p={p} onRemove={async () => {
              await supabase.from('producer_follows').delete().eq('producer_id', p.id).eq('user_id', user.id)
              setProducerFollows(prev => prev.filter(x => x.id !== p.id))
            }} />
          ))
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function FavCard({ evt, onRemove }: { evt: EvenementCard; onRemove: () => void }) {
  const cat = CATEGORIES[evt.categorie] ?? CATEGORIES.autre
  return (
    <Link href={`/evenement/${evt.id}`} style={{ display: 'block', position: 'relative', height: 110, borderRadius: 16, overflow: 'hidden', textDecoration: 'none', flexShrink: 0, boxShadow: '0 2px 10px rgba(44,44,44,0.1)' }}>
      {evt.image_url
        ? <img src={evt.image_url} alt={evt.titre} loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: evt.image_position ?? '50% 50%' }} />
        : <div style={{ position: 'absolute', inset: 0, backgroundColor: cat.color, opacity: 0.8 }} />}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.45) 38%, rgba(0,0,0,0.1) 62%, transparent 85%)' }} />
      <div style={{ position: 'absolute', top: 8, left: 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 800, backgroundColor: cat.color, color: '#fff', borderRadius: 999, padding: '3px 9px' }}>
          {cat.emoji} {cat.label}
        </span>
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '8px 44px 10px 12px' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#fff', fontFamily: 'Inter, sans-serif', lineHeight: 1.25, margin: '0 0 3px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{evt.titre}</h3>
        {evt.date_debut && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.78)', margin: 0 }}>{formatDate(evt.date_debut)}{evt.heure ? ` · ${evt.heure.slice(0, 5)}` : ''}{evt.lieux?.commune ? ` • ${evt.lieux.commune}` : ''}</p>}
      </div>
      <button onClick={e => { e.preventDefault(); e.stopPropagation(); onRemove() }}
        style={{ position: 'absolute', bottom: 8, right: 8, width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.55)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="#EC407A" stroke="#EC407A" strokeWidth="1.5">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
      </button>
    </Link>
  )
}
