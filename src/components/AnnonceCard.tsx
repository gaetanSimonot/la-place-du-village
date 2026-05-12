'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  getPrixAffiche,
  getNextDropDate,
  formatCountdown,
  getProchaineBaisse,
  getPrixTimeline,
  CATEGORIES_ICONS,
  CATEGORIES_LABELS,
  type Annonce,
} from '@/lib/annonces'

interface Props {
  annonce: Annonce
}

const TYPE_INFO: Record<Annonce['type'], { label: string; emoji: string; color: string; bg: string }> = {
  vente:            { label: 'Vente',             emoji: '🏷️', color: '#3A5BC7', bg: '#EEF3FF' },
  troc:             { label: 'Troc',              emoji: '🔄', color: '#E8622A', bg: '#FFF0EB' },
  don:              { label: 'Don',               emoji: '🎁', color: '#2D5A3D', bg: '#E8F2EB' },
  enchere_inversee: { label: 'Enchère inversée',  emoji: '📉', color: '#C0392B', bg: '#FBE9E7' },
}

export default function AnnonceCard({ annonce }: Props) {
  const info = TYPE_INFO[annonce.type]
  const isEnchere = annonce.type === 'enchere_inversee'
  const photo = annonce.photos[0]

  return (
    <Link
      href={`/annonces/${annonce.id}`}
      style={{
        display: 'block',
        backgroundColor: '#fff',
        borderRadius: 18,
        textDecoration: 'none',
        color: 'inherit',
        boxShadow: '0 1px 8px rgba(44,28,16,0.08)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Header card : labels + catégorie */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px 0' }}>
        <span style={{
          fontSize: 10, fontWeight: 800,
          color: info.color, backgroundColor: info.bg,
          padding: '4px 10px', borderRadius: 999,
          letterSpacing: '0.05em', textTransform: 'uppercase',
        }}>
          {info.emoji} {info.label.toUpperCase()}
        </span>
        <span style={{ fontSize: 11, color: '#8A7A6A', fontWeight: 600 }}>
          {CATEGORIES_LABELS[annonce.categorie]}
        </span>
      </div>

      {/* Badge En vedette */}
      {annonce.sponsored && (
        <span style={{
          position: 'absolute', top: 12, right: 56,
          fontSize: 9, fontWeight: 800, color: '#fff',
          backgroundColor: '#E8622A', padding: '3px 8px', borderRadius: 999,
          letterSpacing: '0.05em', textTransform: 'uppercase',
        }}>✦ En vedette</span>
      )}

      <div style={{ display: 'flex', gap: 12, padding: '10px 14px 14px' }}>
        {/* Photo */}
        <div style={{
          width: 110, height: 110, flexShrink: 0,
          borderRadius: 12, overflow: 'hidden',
          backgroundColor: '#F0EBE3',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {photo
            ? <img src={photo} alt={annonce.titre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: 36 }}>{CATEGORIES_ICONS[annonce.categorie]}</span>
          }
        </div>

        {/* Infos */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h3 style={{
            margin: 0, fontSize: 15, fontWeight: 800, color: '#2C1810',
            lineHeight: 1.2,
            overflow: 'hidden', textOverflow: 'ellipsis',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {annonce.titre}
          </h3>
          {annonce.ville && (
            <p style={{ margin: 0, fontSize: 11, color: '#8A7A6A' }}>📍 {annonce.ville}</p>
          )}

          {/* Prix + countdown enchère */}
          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 900, color: info.color, fontVariantNumeric: 'tabular-nums' }}>
                {getPrixAffiche(annonce)}
              </p>
              {isEnchere && (
                <p style={{ margin: 0, fontSize: 10, color: '#8A7A6A' }}>Prix actuel</p>
              )}
            </div>
            {isEnchere && annonce.statut === 'active' && <EnchereCountdown annonce={annonce} compact />}
          </div>
        </div>
      </div>

      {/* Mini timeline prix pour les enchères actives */}
      {isEnchere && annonce.statut === 'active' && (
        <div style={{ padding: '0 14px 12px' }}>
          <p style={{ margin: '0 0 4px', fontSize: 9, fontWeight: 800, color: '#8A7A6A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Évolution du prix
          </p>
          <PrixMiniTimeline annonce={annonce} />
        </div>
      )}
    </Link>
  )
}

function EnchereCountdown({ annonce, compact }: { annonce: Annonce; compact?: boolean }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const next = getNextDropDate(now)
  const ms = next.getTime() - now.getTime()
  const baisse = getProchaineBaisse(annonce)

  return (
    <div style={{ textAlign: 'right' }}>
      <p style={{ margin: 0, fontSize: 9, color: '#8A7A6A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Prochaine baisse
      </p>
      <p style={{ margin: '1px 0 0', fontSize: compact ? 12 : 14, fontWeight: 800, color: '#C0392B', fontVariantNumeric: 'tabular-nums' }}>
        {formatCountdown(ms)}
      </p>
      {!compact && baisse > 0 && (
        <p style={{ margin: 0, fontSize: 11, color: '#C0392B' }}>−{baisse} €</p>
      )}
    </div>
  )
}

/**
 * Mini line chart maison pour la timeline prix.
 * SVG simple, 6 points max, courbe descendante en orange.
 */
function PrixMiniTimeline({ annonce }: { annonce: Annonce }) {
  const points = getPrixTimeline(annonce, 6)
  if (points.length < 2) return null

  const W = 280
  const H = 38
  const maxP = Math.max(...points.map(p => p.prix))
  const minP = Math.min(...points.map(p => p.prix))
  const range = maxP - minP || 1

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * W
    const y = H - ((p.prix - minP) / range) * (H - 6) - 3
    return [x, y] as const
  })

  const pathD = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      {/* Aire sous la courbe */}
      <path
        d={`${pathD} L${W},${H} L0,${H} Z`}
        fill="#E8622A" fillOpacity="0.10"
      />
      {/* Ligne */}
      <path d={pathD} stroke="#E8622A" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      {/* Points */}
      {coords.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.5" fill="#fff" stroke="#E8622A" strokeWidth="1.5" />
      ))}
    </svg>
  )
}
