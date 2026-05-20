'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { EvenementCard } from '@/lib/types'
import { formatEventDate } from '@/lib/filters'
import { CATEGORIES } from '@/lib/categories'

const INTERVAL_MS = 5500
const CROSS_S     = 0.38

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

interface Props {
  events: EvenementCard[]
  onDiscover: (id: string) => void
  compact?: boolean
}

export default function ProBandeau({ events, onDiscover, compact = false }: Props) {
  const [dismissed, setDismissed] = useState(false)
  const [queue, setQueue]         = useState<EvenementCard[]>([])
  const [idx, setIdx]             = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (events.length === 0) return
    setQueue(shuffle(events))
    setIdx(0)
  }, [events])

  const advance = useCallback(() => {
    setIdx(prev => {
      const next = prev + 1
      if (next >= queue.length) {
        setQueue(shuffle(events))
        return 0
      }
      return next
    })
  }, [queue.length, events])

  useEffect(() => {
    if (dismissed || queue.length === 0) return
    timerRef.current = setTimeout(advance, INTERVAL_MS)
    return () => clearTimeout(timerRef.current)
  }, [idx, dismissed, queue.length, advance])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  if (dismissed || queue.length === 0) return null

  const evt = queue[idx]
  if (!evt) return null
  const cat = CATEGORIES[evt.categorie] ?? CATEGORIES.autre

  /* ── Mode compact (dans la liste pleine) ── */
  if (compact) {
    return (
      <div
        onClick={() => { clearTimeout(timerRef.current); onDiscover(evt.id) }}
        onPointerDown={e => e.stopPropagation()}
        style={{ margin: '0 12px 8px', cursor: 'pointer', flexShrink: 0 }}
      >
        <div style={{ position: 'relative', height: 64, borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 10px rgba(44,44,44,0.10)' }}>
          <AnimatePresence>
            <motion.div key={evt.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: CROSS_S }}
              style={{ position: 'absolute', inset: 0, display: 'flex', backgroundColor: '#fff' }}>
              {/* Image */}
              <div style={{ width: 64, flexShrink: 0, position: 'relative', overflow: 'hidden', backgroundColor: cat.color + '22' }}>
                {evt.image_url
                  ? <img src={evt.image_url} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: evt.image_position ?? '50% 50%' }} />
                  : <div style={{ position: 'absolute', inset: 0, backgroundColor: cat.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{cat.emoji}</div>
                }
              </div>
              {/* Texte */}
              <div style={{ flex: 1, padding: '7px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0, position: 'relative' }}>
                <button onClick={e => { e.stopPropagation(); setDismissed(true) }}
                  style={{ position: 'absolute', top: 5, right: 6, width: 18, height: 18, borderRadius: '50%', backgroundColor: '#F0EBE4', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#8A8A8A', padding: 0 }}>✕</button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                  <span style={{ fontSize: 8, fontWeight: 800, color: '#fff', backgroundColor: '#EC407A', borderRadius: 999, padding: '2px 6px', letterSpacing: '0.06em', fontFamily: 'Inter, sans-serif', flexShrink: 0 }}>✦ À LA UNE</span>
                  {evt.lieux?.commune && <span style={{ fontSize: 10, color: '#6B5E4E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'Inter, sans-serif' }}>{evt.lieux.commune}</span>}
                </div>
                <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 12, color: '#1C1917', margin: 0, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', paddingRight: 18 }}>{evt.titre}</p>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    )
  }

  /* ── Mode flottant : image plein cadre + gradient noir + texte overlay ── */
  return (
    <div
      onClick={() => { clearTimeout(timerRef.current); onDiscover(evt.id) }}
      onPointerDown={e => e.stopPropagation()}
      style={{ margin: '4px 12px 8px', cursor: 'pointer', flexShrink: 0 }}
    >
      <div style={{ position: 'relative', height: 140, borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.22)' }}>
        <AnimatePresence>
          <motion.div key={evt.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: CROSS_S, ease: 'easeInOut' }}
            style={{ position: 'absolute', inset: 0 }}>

            {/* Image plein cadre */}
            {evt.image_url
              ? <img src={evt.image_url} alt="" loading="lazy"
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: evt.image_position ?? '50% 50%' }} />
              : <div style={{ position: 'absolute', inset: 0, backgroundColor: cat.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52 }}>{cat.emoji}</div>
            }

            {/* Gradient haut (pour lisibilité badge) */}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.42) 0%, transparent 45%)' }} />

            {/* Gradient bas (pour lisibilité titre) */}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.28) 55%, transparent 100%)' }} />

            {/* Badge "À la une" — haut gauche */}
            <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{
                fontSize: 10, fontWeight: 800, color: '#fff',
                backgroundColor: '#EC407A',
                borderRadius: 999, padding: '3px 9px',
                letterSpacing: '0.07em', fontFamily: 'Inter, sans-serif',
                boxShadow: '0 2px 8px rgba(236,64,122,0.45)',
              }}>✦ À LA UNE</span>
            </div>

            {/* Bouton fermer — haut droite */}
            <button
              onClick={e => { e.stopPropagation(); setDismissed(true) }}
              style={{
                position: 'absolute', top: 8, right: 8,
                width: 22, height: 22, borderRadius: '50%',
                backgroundColor: 'rgba(0,0,0,0.38)', backdropFilter: 'blur(4px)',
                border: '1px solid rgba(255,255,255,0.25)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, color: '#fff', padding: 0, lineHeight: 1,
              }}>✕</button>

            {/* Texte bas */}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 12px 10px' }}>
              <p style={{
                fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 15,
                color: '#fff', margin: '0 0 4px',
                lineHeight: 1.3, textShadow: '0 1px 6px rgba(0,0,0,0.5)',
                overflow: 'hidden', display: '-webkit-box',
                WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              }}>{evt.titre}</p>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden' }}>
                  {evt.lieux?.commune && (
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.82)', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      📍 {evt.lieux.commune}
                    </span>
                  )}
                  {evt.date_debut && (
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.72)', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' }}>
                      · {formatEventDate(evt.date_debut, evt.date_fin)}{evt.heure && !evt.date_fin ? ` ${evt.heure.slice(0,5)}` : ''}
                    </span>
                  )}
                </div>

                {/* Dots pagination */}
                {queue.length > 1 && (
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginLeft: 8 }}>
                    {queue.slice(0, 5).map((_, i) => (
                      <div key={i} onClick={e => { e.stopPropagation(); setIdx(i) }} style={{
                        width: i === idx ? 14 : 5, height: 5, borderRadius: 3,
                        backgroundColor: i === idx ? '#fff' : 'rgba(255,255,255,0.4)',
                        transition: 'width 0.3s, background-color 0.3s', cursor: 'pointer',
                      }} />
                    ))}
                  </div>
                )}
              </div>
            </div>

          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
