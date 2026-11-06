'use client'
import { useRef, useState } from 'react'

/**
 * UN CURSEUR QU'ON ATTRAPE PAR SA PASTILLE — et rien d'autre.
 *
 * Le curseur natif (<input type="range">) saute là où le doigt se pose : en
 * faisant défiler l'admin sur téléphone, effleurer une piste changeait un
 * réglage (et l'enregistrait). Ici, en deux temps :
 *   - toucher la piste ne fait rien, et le défilement vertical passe
 *     (`touch-action: pan-y`) ;
 *   - seule la pastille s'attrape, et seul un glissé DE CÔTÉ la déplace —
 *     un glissé vertical parti de la pastille fait défiler la page.
 * Au clavier : flèches, Début, Fin.
 */
const ZONE_PRISE = 24  // px autour de la pastille où le doigt l'attrape
const SEUIL = 4        // px de glissé horizontal avant de bouger

export default function Curseur({
  min, max, step = 1, value, onChange, couleur = '#2D5A3D', label,
}: {
  min: number
  max: number
  step?: number
  value: number
  onChange: (v: number) => void
  couleur?: string
  label?: string
}) {
  const piste = useRef<HTMLDivElement>(null)
  const prise = useRef<{ x0: number; parti: boolean } | null>(null)
  const [tenu, setTenu] = useState(false)
  const part = max > min ? (Math.min(max, Math.max(min, value)) - min) / (max - min) : 0

  const valeurA = (clientX: number) => {
    const r = piste.current!.getBoundingClientRect()
    const p = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    const v = min + Math.round((p * (max - min)) / step) * step
    return Math.min(max, Math.max(min, Number(v.toFixed(6))))
  }

  return (
    <div
      ref={piste}
      role="slider" tabIndex={0} aria-label={label}
      aria-valuemin={min} aria-valuemax={max} aria-valuenow={value}
      onKeyDown={e => {
        const pas = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? step
          : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -step : 0
        if (pas) { e.preventDefault(); onChange(Math.min(max, Math.max(min, value + pas))) }
        else if (e.key === 'Home') { e.preventDefault(); onChange(min) }
        else if (e.key === 'End') { e.preventDefault(); onChange(max) }
      }}
      onPointerDown={e => {
        const r = piste.current!.getBoundingClientRect()
        const xPastille = r.left + part * r.width
        if (Math.abs(e.clientX - xPastille) > ZONE_PRISE) return
        prise.current = { x0: e.clientX, parti: false }
        setTenu(true)
        piste.current!.setPointerCapture(e.pointerId)
      }}
      onPointerMove={e => {
        const p = prise.current
        if (!p) return
        if (!p.parti && Math.abs(e.clientX - p.x0) < SEUIL) return
        p.parti = true
        const v = valeurA(e.clientX)
        if (v !== value) onChange(v)
      }}
      onPointerUp={() => { prise.current = null; setTenu(false) }}
      // Le navigateur a pris la main (défilement vertical) : on lâche.
      onPointerCancel={() => { prise.current = null; setTenu(false) }}
      style={{ position: 'relative', height: 30, touchAction: 'pan-y', outline: 'none', cursor: 'default' }}
    >
      <div style={{ position: 'absolute', left: 0, right: 0, top: 12, height: 6, borderRadius: 3, background: '#E8E2D8' }} />
      <div style={{ position: 'absolute', left: 0, top: 12, height: 6, borderRadius: 3, width: `${part * 100}%`, background: couleur }} />
      <div style={{
        position: 'absolute', top: 15, left: `${part * 100}%`,
        width: tenu ? 26 : 22, height: tenu ? 26 : 22, borderRadius: '50%',
        transform: 'translate(-50%, -50%)', background: couleur,
        boxShadow: tenu ? `0 0 0 6px ${couleur}33` : '0 1px 3px rgba(0,0,0,.25)',
        transition: 'width .12s, height .12s, box-shadow .12s', cursor: 'grab',
      }} />
    </div>
  )
}
