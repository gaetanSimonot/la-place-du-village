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

/**
 * Le héros du Village, quand il demande à être repris à la une.
 *
 * Ce n'est pas un second bandeau : c'est une diapo de plus dans CELUI-CI,
 * posée en tête. Le « à la une » est un emplacement unique — en ouvrir un
 * deuxième, c'est n'en avoir plus aucun qui compte.
 */
export interface DiapoHeros {
  titre: string
  sousTitre: string | null
  image: string | null
  etiquette: string
  href: string
  externe: boolean
}

/** Ce que le bandeau fait défiler : des événements, et le héros s'il y est. */
type Diapo =
  | { sorte: 'event'; cle: string; evt: EvenementCard }
  | { sorte: 'heros'; cle: string; h: DiapoHeros }

interface Props {
  events: EvenementCard[]
  onDiscover: (id: string) => void
  compact?: boolean
  /** Le héros du Village, en tête du défilé. */
  heros?: DiapoHeros | null
}

export default function ProBandeau({ events, onDiscover, compact = false, heros = null }: Props) {
  const [dismissed, setDismissed] = useState(false)
  const [queue, setQueue]         = useState<Diapo[]>([])
  const [idx, setIdx]             = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  // Le héros ne se mélange pas au tirage : il ouvre le défilé. C'est ce qu'on
  // a décidé de pousser, il ne peut pas dépendre d'un coup de dé.
  const composer = useCallback((): Diapo[] => {
    const evts: Diapo[] = shuffle(events).map(e => ({ sorte: 'event' as const, cle: e.id, evt: e }))
    return heros ? [{ sorte: 'heros' as const, cle: 'heros', h: heros }, ...evts] : evts
  }, [events, heros])

  useEffect(() => {
    const q = composer()
    if (q.length === 0) return
    setQueue(q)
    setIdx(0)
  }, [composer])

  const advance = useCallback(() => {
    setIdx(prev => {
      const next = prev + 1
      if (next >= queue.length) {
        setQueue(composer())
        return 0
      }
      return next
    })
  }, [queue.length, composer])

  useEffect(() => {
    if (dismissed || queue.length === 0) return
    timerRef.current = setTimeout(advance, INTERVAL_MS)
    return () => clearTimeout(timerRef.current)
  }, [idx, dismissed, queue.length, advance])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  if (dismissed || queue.length === 0) return null

  const diapo = queue[idx]
  if (!diapo) return null

  // Vue commune aux deux sortes : le bandeau ne connaît que ça, ce qui évite
  // de dédoubler chaque mode d'affichage.
  const vue = diapo.sorte === 'heros'
    ? {
        cle: diapo.cle,
        titre: diapo.h.titre,
        sous: diapo.h.sousTitre,
        image: diapo.h.image,
        imagePos: '50% 50%',
        couleur: '#C4622D',
        emoji: '✦',
        etiquette: diapo.h.etiquette.toUpperCase(),
        ouvrir: () => {
          if (diapo.h.externe) window.open(diapo.h.href, '_blank', 'noopener,noreferrer')
          else window.location.href = diapo.h.href
        },
      }
    : (() => {
        const e = diapo.evt
        const c = CATEGORIES[e.categorie] ?? CATEGORIES.autre
        return {
          cle: diapo.cle,
          titre: e.titre,
          sous: e.lieux?.commune ?? null,
          image: e.image_url ?? null,
          imagePos: e.image_position ?? '50% 50%',
          couleur: c.color,
          emoji: c.emoji,
          etiquette: '✦ À LA UNE',
          ouvrir: () => onDiscover(e.id),
        }
      })()

  /* ── Mode compact (dans la liste pleine) ── */
  if (compact) {
    return (
      <div
        onClick={() => { clearTimeout(timerRef.current); vue.ouvrir() }}
        onPointerDown={e => e.stopPropagation()}
        style={{ margin: '0 12px 8px', cursor: 'pointer', flexShrink: 0 }}
      >
        <div style={{ position: 'relative', height: 64, borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 10px rgba(44,44,44,0.10)' }}>
          <AnimatePresence>
            <motion.div key={vue.cle} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: CROSS_S }}
              style={{ position: 'absolute', inset: 0, display: 'flex', backgroundColor: '#fff' }}>
              {/* Image */}
              <div style={{ width: 64, flexShrink: 0, position: 'relative', overflow: 'hidden', backgroundColor: vue.couleur + '22' }}>
                {vue.image
                  ? <img src={vue.image} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: vue.imagePos }} />
                  : <div style={{ position: 'absolute', inset: 0, backgroundColor: vue.couleur, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{vue.emoji}</div>
                }
              </div>
              {/* Texte */}
              <div style={{ flex: 1, padding: '7px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0, position: 'relative' }}>
                <button onClick={e => { e.stopPropagation(); setDismissed(true) }}
                  style={{ position: 'absolute', top: 5, right: 6, width: 18, height: 18, borderRadius: '50%', backgroundColor: '#F0EBE4', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#8A8A8A', padding: 0 }}>✕</button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                  <span style={{ fontSize: 8, fontWeight: 800, color: '#fff', backgroundColor: '#EC407A', borderRadius: 999, padding: '2px 6px', letterSpacing: '0.06em', fontFamily: 'var(--font-body), sans-serif', flexShrink: 0 }}>{vue.etiquette}</span>
                  {vue.sous && <span style={{ fontSize: 10, color: '#6B5E4E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-body), sans-serif' }}>{vue.sous}</span>}
                </div>
                <p style={{ fontFamily: 'var(--font-body), sans-serif', fontWeight: 700, fontSize: 12, color: '#1C1917', margin: 0, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', paddingRight: 18 }}>{vue.titre}</p>
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
      onClick={() => { clearTimeout(timerRef.current); vue.ouvrir() }}
      onPointerDown={e => e.stopPropagation()}
      style={{ margin: '4px 12px 8px', cursor: 'pointer', flexShrink: 0 }}
    >
      <div style={{ position: 'relative', height: 140, borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.22)' }}>
        <AnimatePresence>
          <motion.div key={vue.cle} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: CROSS_S, ease: 'easeInOut' }}
            style={{ position: 'absolute', inset: 0 }}>

            {/* Image plein cadre */}
            {vue.image
              ? <img src={vue.image} alt="" loading="lazy"
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: vue.imagePos }} />
              : <div style={{ position: 'absolute', inset: 0, backgroundColor: vue.couleur, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52 }}>{vue.emoji}</div>
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
                letterSpacing: '0.07em', fontFamily: 'var(--font-body), sans-serif',
                boxShadow: '0 2px 8px rgba(236,64,122,0.45)',
              }}>{vue.etiquette}</span>
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
                fontFamily: 'var(--font-body), sans-serif', fontWeight: 800, fontSize: 15,
                color: '#fff', margin: '0 0 4px',
                lineHeight: 1.3, textShadow: '0 1px 6px rgba(0,0,0,0.5)',
                overflow: 'hidden', display: '-webkit-box',
                WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              }}>{vue.titre}</p>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden' }}>
                  {/* La ligne du bas dit le lieu et la date pour un événement,
                      le sous-titre pour le héros — même place, même rôle. */}
                  {diapo.sorte === 'heros' ? (
                    vue.sous && (
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.82)', fontFamily: 'var(--font-body), sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {vue.sous}
                      </span>
                    )
                  ) : (
                    <>
                      {diapo.evt.lieux?.commune && (
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.82)', fontFamily: 'var(--font-body), sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          📍 {diapo.evt.lieux.commune}
                        </span>
                      )}
                      {diapo.evt.date_debut && (
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.72)', fontFamily: 'var(--font-body), sans-serif', whiteSpace: 'nowrap' }}>
                          · {formatEventDate(diapo.evt.date_debut, diapo.evt.date_fin)}{diapo.evt.heure && !diapo.evt.date_fin ? ` ${diapo.evt.heure.slice(0,5)}` : ''}
                        </span>
                      )}
                    </>
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
