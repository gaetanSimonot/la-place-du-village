'use client'
import Link from 'next/link'
import { EvenementCard } from '@/lib/types'
import { CATEGORIES } from '@/lib/categories'
import { formatDate } from '@/lib/filters'

interface Props {
  events: EvenementCard[]
  onToggleFav: (id: string) => void
}

export default function FavorisView({ events, onToggleFav }: Props) {
  return (
    <div style={{ minHeight: '100%', backgroundColor: 'var(--creme)', fontFamily: 'Inter, sans-serif' }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        backgroundColor: '#fff', borderBottom: '1px solid #EDE8E0',
        padding: '12px 16px',
      }}>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 18, color: '#2C1810', margin: 0 }}>
          Mes favoris
        </h1>
      </div>

      <div style={{ padding: '16px 16px 40px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {events.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <p style={{ fontSize: 48, marginBottom: 12 }}>🤍</p>
            <p style={{ fontWeight: 700, fontSize: 16, fontFamily: 'Syne, sans-serif', color: '#2C1810', marginBottom: 6 }}>
              Aucun favori pour l&apos;instant
            </p>
            <p style={{ fontSize: 13, color: '#8A8A8A' }}>
              Appuie sur le cœur d&apos;un événement pour le retrouver ici.
            </p>
          </div>
        ) : (
          events.map(evt => (
            <FavCard key={evt.id} evt={evt} onRemove={() => onToggleFav(evt.id)} />
          ))
        )}
      </div>
    </div>
  )
}

function FavCard({ evt, onRemove }: { evt: EvenementCard; onRemove: () => void }) {
  const cat = CATEGORIES[evt.categorie] ?? CATEGORIES.autre

  return (
    <Link href={`/evenement/${evt.id}`} style={{
      display: 'block', position: 'relative', height: 110,
      borderRadius: 16, overflow: 'hidden', textDecoration: 'none', flexShrink: 0,
      boxShadow: '0 2px 10px rgba(44,44,44,0.1)',
    }}>
      {evt.image_url
        ? <img src={evt.image_url} alt={evt.titre} loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: evt.image_position ?? '50% 50%' }} />
        : <div style={{ position: 'absolute', inset: 0, backgroundColor: cat.color, opacity: 0.8 }} />
      }
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.45) 38%, rgba(0,0,0,0.1) 62%, transparent 85%)' }} />

      <div style={{ position: 'absolute', top: 8, left: 8 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 11, fontWeight: 800,
          backgroundColor: cat.color, color: '#fff',
          borderRadius: 999, padding: '3px 9px',
        }}>
          {cat.emoji} {cat.label}
        </span>
      </div>

      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '8px 44px 10px 12px' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#fff', fontFamily: 'Syne, sans-serif', lineHeight: 1.25, margin: '0 0 3px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {evt.titre}
        </h3>
        {evt.date_debut && (
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.78)', margin: 0 }}>
            {formatDate(evt.date_debut)}{evt.heure ? ` · ${evt.heure.slice(0, 5)}` : ''}{evt.lieux?.commune ? ` • ${evt.lieux.commune}` : ''}
          </p>
        )}
      </div>

      {/* Bouton retirer favori */}
      <button
        onClick={e => { e.preventDefault(); e.stopPropagation(); onRemove() }}
        style={{
          position: 'absolute', bottom: 8, right: 8,
          width: 28, height: 28, borderRadius: 8,
          backgroundColor: 'rgba(0,0,0,0.55)', border: 'none',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        title="Retirer des favoris"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="#EC407A" stroke="#EC407A" strokeWidth="1.5">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
      </button>
    </Link>
  )
}
