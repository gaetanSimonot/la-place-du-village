'use client'
import Link from 'next/link'
import type { Annonce } from '@/lib/annonces'
import { getPrixAffiche, CATEGORIES_ICONS, CATEGORIES_LABELS } from '@/lib/annonces'

interface Props {
  annonce: Annonce
}

const TYPE_LABELS: Record<Annonce['type'], string> = {
  vente: 'Vente',
  troc: 'Troc',
  don: 'Don',
  enchere_inversee: 'Enchère',
}

const TYPE_COLORS: Record<Annonce['type'], { bg: string; fg: string }> = {
  vente:            { bg: '#EEF3FF', fg: '#3A5BC7' },
  troc:             { bg: '#FFF0EB', fg: '#E8622A' },
  don:              { bg: '#E8F2EB', fg: '#2D5A3D' },
  enchere_inversee: { bg: '#FBE9E7', fg: '#C0392B' },
}

export default function AnnonceCard({ annonce }: Props) {
  const photo  = annonce.photos[0]
  const colors = TYPE_COLORS[annonce.type]

  return (
    <Link
      href={`/annonces/${annonce.id}`}
      style={{
        display: 'flex',
        gap: 12,
        padding: 12,
        backgroundColor: '#fff',
        borderRadius: 16,
        textDecoration: 'none',
        color: 'inherit',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {annonce.sponsored && (
        <div style={{
          position: 'absolute',
          top: 8,
          right: 8,
          backgroundColor: '#E8622A',
          color: '#fff',
          fontSize: 10,
          fontWeight: 800,
          padding: '3px 8px',
          borderRadius: 999,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          zIndex: 1,
        }}>
          ✦ En vedette
        </div>
      )}

      {/* Photo */}
      <div style={{
        width: 96,
        height: 96,
        flexShrink: 0,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: '#F0EBE3',
      }}>
        {photo ? (
          <img src={photo} alt={annonce.titre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32,
          }}>
            {CATEGORIES_ICONS[annonce.categorie]}
          </div>
        )}
      </div>

      {/* Infos */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 10,
            fontWeight: 800,
            color: colors.fg,
            backgroundColor: colors.bg,
            padding: '2px 8px',
            borderRadius: 999,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}>
            {TYPE_LABELS[annonce.type]}
          </span>
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            color: '#8A7A6A',
            padding: '2px 8px',
            borderRadius: 999,
            border: '1px solid #E5DDD2',
          }}>
            {CATEGORIES_LABELS[annonce.categorie]}
          </span>
        </div>

        <h3 style={{
          margin: '2px 0 0',
          fontSize: 15,
          fontWeight: 800,
          color: '#1C1917',
          lineHeight: 1.2,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}>
          {annonce.titre}
        </h3>

        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 900, color: '#1C1917', fontVariantNumeric: 'tabular-nums' }}>
            {getPrixAffiche(annonce)}
          </span>
          {annonce.ville && (
            <span style={{ fontSize: 11, color: '#8A7A6A', textAlign: 'right' }}>
              📍 {annonce.ville}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
