'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useFavorites } from '@/hooks/useFavorites'
import { lienEvenement } from '@/lib/lienEvenement'
import { EvenementCard } from '@/lib/types'
import type { SourcePage } from '@/lib/agendaPublic'
import { CATEGORIES, eventCategories } from '@/lib/categories'
import { formatEventDate } from '@/lib/filters'
import { imageEvenement } from '@/lib/imageEvenement'
import ImageVignette from '@/components/ImageVignette'

/**
 * La cartouche d'un événement dans l'agenda : vignette à gauche, pastille de
 * catégorie et commune, titre, date, petits boutons. Sortie telle quelle de
 * la feuille de la carte (BottomSheet) pour servir aussi aux pages d'entrée
 * (« Que faire à Ganges ») : une seule cartouche, la même partout.
 */
export default function EventListCard({ evt, isSelected = false, onSelect, onViewOnMap, onOpenEvent, isFav, onToggleFav,
  selectMode, isPicked, onLongPress, onTogglePick }: {
  evt: EvenementCard; isSelected?: boolean; onSelect?: () => void; onViewOnMap?: () => void
  onOpenEvent?: () => void; isFav?: boolean; onToggleFav?: () => void
  // Sélection multiple admin (clic long sur l'agenda)
  selectMode?: boolean; isPicked?: boolean
  onLongPress?: () => void; onTogglePick?: () => void
}) {
  const cats = eventCategories(evt)
  const cat  = CATEGORIES[cats[0]] ?? CATEGORIES.autre
  const lieu = evt.lieux

  // Détection clic long (touch + souris) sans déclencher la navigation.
  // Seuil de mouvement 10px : on n'annule QUE si le doigt bouge vraiment
  // (un scroll), pas au micro-jitter — sinon le long-press ne se déclenche
  // jamais sur tactile (pointermove émis en continu doigt immobile).
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lpFired = useRef(false)
  const lpStart = useRef<{ x: number; y: number } | null>(null)
  const cancelLongPress = () => {
    if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null }
    lpStart.current = null
  }

  return (
    <Link href={lienEvenement(evt)}
      data-evt-id={evt.id}
      onClick={e => {
        // Si un clic long vient de se déclencher → on avale le clic (pas de nav).
        if (lpFired.current) { e.preventDefault(); lpFired.current = false; return }
        if (selectMode) { e.preventDefault(); onTogglePick?.(); return }
        onSelect?.()
        // Sur bureau, la fiche s'ouvre en fenêtre par-dessus la carte :
        // on empêche la navigation, le parent s'en charge. Sur mobile, le
        // lien fait son travail comme avant.
        if (onOpenEvent && typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches) {
          e.preventDefault()
        }
        onOpenEvent?.()
      }}
      onPointerDown={e => {
        if (!onLongPress) return
        lpFired.current = false
        lpStart.current = { x: e.clientX, y: e.clientY }
        lpTimer.current = setTimeout(() => { lpFired.current = true; onLongPress() }, 450)
      }}
      onPointerMove={e => {
        if (lpStart.current && (Math.abs(e.clientX - lpStart.current.x) > 10 || Math.abs(e.clientY - lpStart.current.y) > 10)) cancelLongPress()
      }}
      onPointerUp={cancelLongPress}
      onPointerCancel={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onContextMenu={e => { if (onLongPress) e.preventDefault() }}
      style={{
      display: 'flex', height: 86, flexShrink: 0, position: 'relative',
      WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none',
      borderRadius: 14, overflow: 'hidden', textDecoration: 'none',
      backgroundColor: '#fff',
      boxShadow: isPicked
        ? `0 0 0 2.5px var(--vert, #2D5A3D), 0 4px 18px rgba(0,0,0,0.18)`
        : isSelected
        ? `0 0 0 2.5px var(--primary), 0 4px 18px rgba(0,0,0,0.14)`
        : '0 1px 6px rgba(44,44,44,0.09)',
    }}>
      {/* Pastille de sélection (mode sélection admin) */}
      {selectMode && (
        <div style={{
          position: 'absolute', top: 6, left: 6, zIndex: 2,
          width: 22, height: 22, borderRadius: 999,
          background: isPicked ? 'var(--vert, #2D5A3D)' : 'rgba(255,255,255,0.92)',
          border: isPicked ? 'none' : '2px solid #B8AFA2',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
        }}>
          {isPicked && (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>
      )}
      {/* Image gauche — l'affiche de l'événement, sinon l'illustration de sa
          catégorie, sinon l'emoji sur aplat (comportement historique). */}
      <div style={{ width: 86, flexShrink: 0, position: 'relative', overflow: 'hidden', backgroundColor: cat.color + '22' }}>
        {imageEvenement(evt)
          ? <ImageVignette src={imageEvenement(evt)!} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: evt.image_url ? (evt.image_position ?? '50% 50%') : '50% 50%' }} />
          : <div style={{ position: 'absolute', inset: 0, backgroundColor: cat.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>{cat.emoji}</div>
        }
      </div>

      {/* Contenu droite */}
      <div style={{ flex: 1, padding: '8px 10px 8px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}>
        {/* Haut : badge(s) + titre */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3, flexWrap: 'nowrap', overflow: 'hidden' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', flexShrink: 0,
              fontSize: 9, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase',
              color: '#fff', backgroundColor: cat.color,
              borderRadius: 999, padding: '2px 7px',
            }}>{cat.label}</span>
            {/* Catégories additionnelles → pastilles colorées compactes */}
            {cats.slice(1).map(c => {
              const extra = CATEGORIES[c] ?? CATEGORIES.autre
              return (
                <span key={c} title={extra.label} style={{
                  flexShrink: 0, width: 9, height: 9, borderRadius: 999,
                  backgroundColor: extra.color, border: '1.5px solid #fff',
                  boxShadow: '0 0 0 0.5px rgba(0,0,0,0.08)',
                }} />
              )
            })}
            {lieu?.commune && (
              <span style={{ fontSize: 10, color: '#6B5E4E', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {lieu.commune}
              </span>
            )}
          </div>
          <h3 style={{
            fontFamily: 'var(--font-body), sans-serif', fontWeight: 700, fontSize: 14,
            color: '#1C1917', margin: 0, lineHeight: 1.3,
            overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {evt.titre}
          </h3>
        </div>

        {/* Bas : date + actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {evt.date_debut ? (
            <p style={{ fontSize: 11, color: '#6B5E4E', margin: 0, }}>
              {formatEventDate(evt.date_debut, evt.date_fin)}{evt.heure && !evt.date_fin ? ` · ${evt.heure.slice(0,5)}` : ''}
            </p>
          ) : <div />}

          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            {lieu?.lat && lieu?.lng && (
              <button onClick={e => { e.preventDefault(); e.stopPropagation(); onViewOnMap?.() }}
                style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: '#EDE8DF', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B5E4E' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                  <circle cx="12" cy="9" r="2.5" fill="currentColor" stroke="none"/>
                </svg>
              </button>
            )}
            <button onClick={e => { e.preventDefault(); e.stopPropagation(); onToggleFav?.() }}
              style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: '#EDE8DF', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill={isFav ? '#EC407A' : 'none'} stroke={isFav ? '#EC407A' : '#6B5E4E'} strokeWidth="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
            </button>
            <button onClick={e => {
              e.preventDefault(); e.stopPropagation()
              const url = `${window.location.origin}${lienEvenement(evt)}`
              if (navigator.share) { navigator.share({ title: evt.titre, url }).catch(() => {}) }
              else { navigator.clipboard.writeText(url).catch(() => {}) }
            }}
              style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: '#EDE8DF', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6B5E4E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </Link>
  )
}

/**
 * La liste de cartouches des pages d'entrée (« Que faire à Ganges ») : les
 * mêmes boutons que sur la carte. Le favori passe par le même crochet que la
 * fiche événement (connecté ou non) ; « voir sur la carte » ouvre la carte
 * de l'app sur l'événement (?evt=, lu par l'écran carte).
 *
 * Comme l'agenda : la page envoie les premières, la suite arrive par paquets
 * quand on approche du bas (api/pages-entree). Sans `source`, tout est déjà là.
 */
export function ListeCartouches({ evenements, total, source }: {
  evenements: EvenementCard[]
  total?: number
  source?: SourcePage
}) {
  const router = useRouter()
  const { isFav, toggle } = useFavorites()
  const [liste, setListe] = useState(evenements)
  const [etat, setEtat] = useState<'pret' | 'charge' | 'erreur'>('pret')
  const fin = useRef<HTMLDivElement>(null)
  const reste = source && total != null && liste.length < total

  const suite = useCallback(async () => {
    if (!source || etat === 'charge') return
    setEtat('charge')
    try {
      const q = new URLSearchParams({ niveau: source.niveau, slug: source.slug, depuis: String(liste.length) })
      if ('type' in source && source.type) q.set('type', source.type)
      if ('commune' in source && source.commune) q.set('commune', source.commune)
      const r = await fetch(`/api/pages-entree?${q}`)
      if (!r.ok) throw new Error(String(r.status))
      const j = await r.json() as { evenements: EvenementCard[] }
      setListe(l => {
        const vus = new Set(l.map(e => e.id))
        return [...l, ...j.evenements.filter(e => !vus.has(e.id))]
      })
      setEtat(j.evenements.length ? 'pret' : 'erreur')
    } catch {
      setEtat('erreur')
    }
  }, [source, etat, liste.length])

  // On demande la suite un peu AVANT d'arriver au bas : elle est là quand on y est.
  useEffect(() => {
    const el = fin.current
    if (!el || !reste || etat !== 'pret') return
    const obs = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) void suite() }, { rootMargin: '600px 0px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [reste, etat, suite])

  return (
    <div className="flex flex-col gap-2.5">
      {liste.map(e => (
        <EventListCard
          key={e.id}
          evt={e}
          isFav={isFav(e.id)}
          onToggleFav={() => toggle(e.id)}
          onViewOnMap={() => {
            // Lu par l'écran carte au premier rendu : pas d'écrans de premier passage.
            try { sessionStorage.setItem('pdv-vers-evenement', '1') } catch {}
            router.push(`/?mode=agenda&evt=${encodeURIComponent(e.id)}`)
          }}
        />
      ))}
      {reste && (
        <div ref={fin} className="flex justify-center py-3">
          {etat === 'erreur' ? (
            <button onClick={() => { setEtat('pret'); void suite() }}
              style={{ height: 36, padding: '0 16px', borderRadius: 999, border: '1px solid #E6DCC8', background: '#fff', color: '#2D5A3D', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              Voir la suite
            </button>
          ) : (
            <span style={{ fontSize: 12, color: '#6B5E4E' }}>Chargement de la suite…</span>
          )}
        </div>
      )}
    </div>
  )
}
