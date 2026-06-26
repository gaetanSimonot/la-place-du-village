'use client'
import { useRef, useState } from 'react'

/**
 * CROP RECT — composant de cadrage façon admin
 *
 * Plein écran sombre + image en object-contain + rectangle blanc de
 * "zone utile" (ce qui sera réellement visible après object-cover dans
 * un conteneur d'aspect `aspect`). Le user clique/drag pour repositionner
 * le rectangle. La position est stockée au format CSS `object-position`
 * en pourcentage : "50% 50%".
 *
 * Pattern repris de hub-carousel admin + EventEditDrawer.CropStep, refactorisé
 * en composant unique pour usage cross-app.
 */

interface Props {
  src: string
  /** object-position courant (ex: "50% 50%") */
  position: string
  /** Aspect ratio cible (width/height). Default 3 ≈ vignette event card. */
  aspect?: number
  /** Titre header (default "Cadrer la photo") */
  title?: string
  /** Hint bas d'écran */
  hint?: string
  onCancel: () => void
  onConfirm: (position: string) => void
}

export default function CropRect({
  src,
  position,
  aspect = 3,
  title = 'Cadrer la photo',
  hint = 'Touche / clique pour repositionner la zone visible.',
  onCancel,
  onConfirm,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [pos, setPos] = useState(position || '50% 50%')

  const [px, py] = pos.split(' ').map(v => parseFloat(v) || 0)

  function computeLayout(cW: number, cH: number, nW: number, nH: number) {
    // Image fittée en object-contain dans le container (rW × rH)
    const ir = nW / nH, cr = cW / cH
    let rW: number, rH: number, oX: number, oY: number
    if (ir > cr) { rW = cW; rH = cW / ir; oX = 0; oY = (cH - rH) / 2 }
    else         { rH = cH; rW = cH * ir; oX = (cW - rW) / 2; oY = 0 }
    // Crop window = zone visible après object-cover dans aspect cible
    let cropW: number, cropH: number
    if (rW / rH > aspect) {
      cropH = rH
      cropW = rH * aspect
    } else {
      cropW = rW
      cropH = rW / aspect
    }
    return { rW, rH, oX, oY, cropW, cropH }
  }

  const layout = (() => {
    const c = containerRef.current
    if (!c || !natural) return null
    const { width: cW, height: cH } = c.getBoundingClientRect()
    const l = computeLayout(cW, cH, natural.w, natural.h)
    return {
      ...l,
      cropLeft: l.oX + (l.rW - l.cropW) * px / 100,
      cropTop:  l.oY + (l.rH - l.cropH) * py / 100,
    }
  })()

  const handlePointer = (e: React.PointerEvent) => {
    const c = containerRef.current
    if (!c || !natural) return
    const rect = c.getBoundingClientRect()
    const l = computeLayout(rect.width, rect.height, natural.w, natural.h)
    const rX = Math.max(0, Math.min(1, (e.clientX - rect.left - l.oX) / l.rW))
    const rY = Math.max(0, Math.min(1, (e.clientY - rect.top  - l.oY) / l.rH))
    setPos(`${Math.round(rX * 100)}% ${Math.round(rY * 100)}%`)
  }

  const D = 'rgba(0,0,0,0.62)'

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        backgroundColor: '#000',
        display: 'flex', flexDirection: 'column',
        userSelect: 'none',
        fontFamily: 'var(--font-body), sans-serif',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', flexShrink: 0,
      }}>
        <button
          onClick={onCancel}
          style={{
            background: 'none', border: 'none', color: '#B0B0B0',
            fontSize: 13, cursor: 'pointer', padding: '6px 4px',
          }}
        >
          ← Annuler
        </button>
        <p style={{ margin: 0, color: '#fff', fontWeight: 700, fontSize: 14 }}>{title}</p>
        <button
          onClick={() => onConfirm(pos)}
          style={{
            backgroundColor: '#2D5A3D', color: '#fff',
            padding: '8px 14px', borderRadius: 10,
            border: 'none', fontSize: 13, fontWeight: 800, cursor: 'pointer',
          }}
        >
          OK
        </button>
      </div>

      {/* Image + crop window */}
      <div
        ref={containerRef}
        style={{
          position: 'relative', flex: 1, overflow: 'hidden',
          touchAction: 'none', cursor: 'crosshair',
        }}
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); handlePointer(e) }}
        onPointerMove={e => { if (e.buttons > 0) handlePointer(e) }}
      >
        <img
          src={src}
          alt=""
          style={{
            width: '100%', height: '100%',
            objectFit: 'contain', userSelect: 'none', pointerEvents: 'none',
          }}
          onLoad={e => {
            const i = e.currentTarget
            setNatural({ w: i.naturalWidth, h: i.naturalHeight })
          }}
        />
        {layout && (
          <div style={{
            position: 'absolute',
            top: layout.oY, left: layout.oX,
            width: layout.rW, height: layout.rH,
            pointerEvents: 'none',
          }}>
            {/* Masques sombres autour du crop */}
            <div style={{ position: 'absolute', top: 0, left: 0, width: layout.cropLeft - layout.oX, height: layout.rH, backgroundColor: D }} />
            <div style={{ position: 'absolute', top: 0, right: 0, width: layout.rW - (layout.cropLeft - layout.oX) - layout.cropW, height: layout.rH, backgroundColor: D }} />
            <div style={{ position: 'absolute', top: 0, left: layout.cropLeft - layout.oX, width: layout.cropW, height: layout.cropTop - layout.oY, backgroundColor: D }} />
            <div style={{ position: 'absolute', bottom: 0, left: layout.cropLeft - layout.oX, width: layout.cropW, height: layout.rH - (layout.cropTop - layout.oY) - layout.cropH, backgroundColor: D }} />
            {/* Cadre blanc = zone utile */}
            <div style={{
              position: 'absolute',
              top: layout.cropTop - layout.oY,
              left: layout.cropLeft - layout.oX,
              width: layout.cropW,
              height: layout.cropH,
              border: '2px solid #fff',
              borderRadius: 4,
              boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
            }} />
          </div>
        )}
      </div>

      {/* Hint */}
      <p style={{
        margin: 0, padding: '10px 16px 16px',
        color: '#B0B0B0', fontSize: 12, textAlign: 'center', flexShrink: 0,
      }}>
        {hint}
      </p>
    </div>
  )
}
