'use client'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/**
 * LE SÉLECTEUR DE MODE DE LA CARTE, EN MOLETTE (barre du haut, téléphone).
 *
 * Une pastille verte FIXE au milieu ; les mots glissent dessous au doigt. On
 * en voit trois : le choisi au centre, un voisin de chaque côté, les autres
 * s'effacent sur les bords. Au lâcher, la bande se pose sur le mot le plus
 * proche (l'élan du doigt compte) et la carte bascule — une fois posée
 * seulement : changer de mode à chaque mot qui passe rechargerait la carte
 * trois fois de suite. Toucher un mot l'amène au centre.
 *
 * EN BOUCLE. La liste est écrite trois fois ; on vit sur la copie du milieu.
 * Une fois la bande posée, on la ramène sans animation sur le même mot de la
 * copie du milieu : le contenu est identique, le saut ne se voit pas, et il
 * reste toujours une liste entière de chaque côté pour glisser.
 *
 * Pas de zone défilante : une piste déplacée par `transform`, menée ici.
 */

export interface ModeCarte<T extends string> {
  id: T
  label: string
  icone?: ReactNode
}

const VISIBLES = 3
const COPIES = 3
const DUREE_POSE = 260   // ms, la bande qui se pose

export default function SelecteurModes<T extends string>({ modes, actif, onChoisir }: {
  modes: ModeCarte<T>[]
  actif: T
  onChoisir: (id: T) => void
}) {
  const n = modes.length
  const cadreRef = useRef<HTMLDivElement>(null)
  const [largeur, setLargeur] = useState(0)
  const indexActif = Math.max(0, modes.findIndex(m => m.id === actif))
  // La position, en cases, dans la liste triplée — sur la copie du milieu au repos.
  const [pose, setPose] = useState(n + indexActif)
  // Lue au lâcher du doigt, hors du rendu.
  const poseRef = useRef(pose)
  poseRef.current = pose
  const [decalage, setDecalage] = useState(0)
  const [anime, setAnime] = useState(false)
  const geste = useRef<{ x0: number; derX: number; derT: number; v: number; glisse: boolean } | null>(null)
  const aGlisse = useRef(false)
  const minuteur = useRef<ReturnType<typeof setTimeout>>()

  const modulo = (i: number) => ((i % n) + n) % n

  // Un changement venu d'ailleurs (adresse, autre bouton) : la bande suit.
  useEffect(() => { setPose(p => (modulo(p) === indexActif ? p : n + indexActif)) },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [indexActif, n])
  useEffect(() => () => clearTimeout(minuteur.current), [])

  useLayoutEffect(() => {
    const el = cadreRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setLargeur(el.clientWidth))
    ro.observe(el)
    setLargeur(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const case_ = largeur / VISIBLES
  const total = n * COPIES
  const borne = (i: number) => Math.min(total - 1, Math.max(0, i))
  // La case sous la pastille, pendant le glissé compris.
  const auCentre = case_ ? borne(Math.round(pose - decalage / case_)) : pose

  const choisir = (i: number) => {
    const cible = borne(i)
    setAnime(true)
    setPose(cible)
    setDecalage(0)
    clearTimeout(minuteur.current)
    minuteur.current = setTimeout(() => {
      // Posée : retour invisible sur le même mot de la copie du milieu.
      setAnime(false)
      setPose(n + modulo(cible))
      const id = modes[modulo(cible)].id
      if (id !== actif) onChoisir(id)
    }, DUREE_POSE)
  }

  const surAppui = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    clearTimeout(minuteur.current)
    // Un appui pendant que la bande se pose : on la fige sur sa copie du milieu.
    setAnime(false)
    setPose(p => n + modulo(p))
    aGlisse.current = false
    geste.current = { x0: e.clientX, derX: e.clientX, derT: e.timeStamp, v: 0, glisse: false }

    const bouge = (ev: PointerEvent) => {
      const g = geste.current
      if (!g) return
      const dx = ev.clientX - g.x0
      if (!g.glisse && Math.abs(dx) < 6) return
      g.glisse = true
      aGlisse.current = true
      // Une liste entière de marge de chaque côté : on ne va jamais au-delà.
      const lim = n * case_
      setDecalage(Math.max(-lim, Math.min(lim, dx)))
      const dt = ev.timeStamp - g.derT
      if (dt > 0) g.v = 0.7 * ((ev.clientX - g.derX) / dt) + 0.3 * g.v
      g.derX = ev.clientX; g.derT = ev.timeStamp
    }
    const leve = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', bouge)
      window.removeEventListener('pointerup', leve)
      window.removeEventListener('pointercancel', leve)
      const g = geste.current
      geste.current = null
      if (!g?.glisse || !case_) return
      // L'élan : là où la bande irait encore en ~180 ms, sans dépasser une liste.
      const projete = Math.max(-n * case_, Math.min(n * case_, (ev.clientX - g.x0) + g.v * 180))
      choisir(Math.round(poseRef.current - projete / case_))
    }
    window.addEventListener('pointermove', bouge)
    window.addEventListener('pointerup', leve)
    window.addEventListener('pointercancel', leve)
  }

  const x = largeur / 2 - (pose + 0.5) * case_ + decalage
  const piste = Array.from({ length: total }, (_, i) => ({ m: modes[i % n], i, copie: i < n || i >= 2 * n }))

  return (
    <div
      ref={cadreRef}
      onPointerDown={surAppui}
      style={{
        position: 'relative', height: 38, background: '#F7F1E6', borderRadius: 14,
        overflow: 'hidden', touchAction: 'pan-y', userSelect: 'none',
      }}
    >
      {/* La pastille, fixe au milieu */}
      <div aria-hidden style={{
        position: 'absolute', top: 4, bottom: 4, left: '50%', width: Math.max(0, case_ - 8),
        transform: 'translateX(-50%)', borderRadius: 10, background: '#2D5A3D',
      }} />
      <div
        role="tablist"
        style={{
          position: 'absolute', inset: 0, display: 'flex',
          transform: `translate3d(${x.toFixed(1)}px, 0, 0)`,
          transition: anime ? `transform ${DUREE_POSE}ms cubic-bezier(.22,1,.36,1)` : 'none',
        }}
      >
        {piste.map(({ m, i, copie }) => {
          const centre = i === auCentre
          return (
            <button
              key={`${m.id}-${i}`}
              role={copie ? undefined : 'tab'}
              aria-hidden={copie || undefined}
              tabIndex={copie ? -1 : undefined}
              aria-selected={copie ? undefined : m.id === actif}
              onClick={() => { if (!aGlisse.current) choisir(i) }}
              style={{
                flex: `0 0 ${case_}px`, height: '100%', border: 'none', background: 'transparent',
                cursor: 'pointer', padding: '0 4px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                color: centre ? '#fff' : '#7A6A5A',
                fontFamily: 'var(--font-body), sans-serif', fontWeight: centre ? 800 : 700, fontSize: 12.5,
                whiteSpace: 'nowrap', transition: 'color .15s',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {m.icone}{m.label}
            </button>
          )
        })}
      </div>
      {/* Les bords qui effacent les mots au-delà des voisins */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 14,
        background: 'linear-gradient(to right, #F7F1E6 0%, rgba(247,241,230,0) 22%, rgba(247,241,230,0) 78%, #F7F1E6 100%)',
      }} />
    </div>
  )
}
