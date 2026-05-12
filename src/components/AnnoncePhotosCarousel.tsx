'use client'
import { useState } from 'react'
import ImageLightbox from './ImageLightbox'

interface Props {
  photos: string[]
  alt?: string
  height?: number
}

/**
 * Carousel de photos pour une annonce.
 * - Swipe horizontal natif (overflow scroll snap)
 * - Dots de pagination
 * - Chaque slide est wrappée dans ImageLightbox (pinch-to-zoom natif au clic)
 */
export default function AnnoncePhotosCarousel({ photos, alt = '', height = 320 }: Props) {
  const [index, setIndex] = useState(0)

  if (!photos.length) {
    return (
      <div style={{
        height,
        backgroundColor: '#F0EBE3',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#8A7A6A',
        fontSize: 13,
      }}>
        Aucune photo
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', height, backgroundColor: '#000', overflow: 'hidden' }}>
      <div
        onScroll={e => {
          const w = (e.target as HTMLDivElement).offsetWidth
          const s = (e.target as HTMLDivElement).scrollLeft
          setIndex(Math.round(s / w))
        }}
        style={{
          height: '100%',
          display: 'flex',
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          scrollbarWidth: 'none',
        }}
      >
        {photos.map((url, i) => (
          <div
            key={i}
            style={{
              flex: '0 0 100%',
              scrollSnapAlign: 'start',
              height: '100%',
              position: 'relative',
            }}
          >
            <ImageLightbox src={url} alt={alt} />
          </div>
        ))}
      </div>

      {photos.length > 1 && (
        <div style={{
          position: 'absolute',
          bottom: 12,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          gap: 6,
          pointerEvents: 'none',
        }}>
          {photos.map((_, i) => (
            <span
              key={i}
              style={{
                width: i === index ? 22 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: i === index ? '#fff' : 'rgba(255,255,255,0.5)',
                transition: 'width 0.2s',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
