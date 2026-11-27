'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { CATEGORIES, eventCategories } from '@/lib/categories'
import { formatEventDate } from '@/lib/filters'
import { imageEvenement } from '@/lib/imageEvenement'
import type { EvenementCard } from '@/lib/types'

/**
 * APERÇU SOUS LE DOIGT — essai UX, admin seulement (réglages de la carte).
 *
 * Doigt posé sur une cartouche de la liste, immobile un instant : elle
 * grossit sous le doigt et devient l'aperçu de la fiche. Doigt toujours posé,
 * le glisser parcourt la fiche — vers le haut on descend dans la fiche, vers
 * le bas on remonte. Doigt levé : l'aperçu rentre dans sa cartouche.
 *
 * Un tap rapide ouvre la fiche comme avant ; un glissé immédiat fait défiler
 * la liste comme avant. Écouteurs posés sur la fenêtre, touchmove non passif
 * pour couper le défilement natif pendant l'aperçu seulement.
 */
const MAINTIEN_MS = 200   // doigt immobile avant que l'aperçu s'ouvre
const TOLERANCE_PX = 8    // au-delà, c'est un défilement : pas d'aperçu
const DUREE_MS = 260      // ouverture / fermeture

type Rect = { top: number; left: number; width: number; height: number }
type Details = { description?: string | null; prix?: string | null; contact?: string | null; organisateurs?: string | null; lieux?: { nom?: string | null; adresse?: string | null } | null }

const cacheDetails = new Map<string, Details>()

function cible(): Rect {
  const w = window.innerWidth, h = window.innerHeight
  const largeur = Math.min(w - 24, 520)
  return { left: (w - largeur) / 2, width: largeur, top: Math.max(24, h * 0.07), height: h * 0.84 }
}

export default function ApercuSousLeDoigt({ actif, evenements, children, style }: {
  actif: boolean
  evenements: EvenementCard[]
  children: React.ReactNode
  /** Le conteneur prend la place des cartouches dans la liste : même mise en page. */
  style?: React.CSSProperties
}) {
  const zone = useRef<HTMLDivElement>(null)
  const parId = useRef(new Map<string, EvenementCard>())
  parId.current = new Map(evenements.map(e => [e.id, e]))

  const [ouvert, setOuvert] = useState<{ evt: EvenementCard; depart: Rect; phase: 'entre' | 'ouvert' | 'sort' } | null>(null)
  const [details, setDetails] = useState<Details | null>(null)
  const contenu = useRef<HTMLDivElement>(null)
  const panneau = useRef<HTMLDivElement>(null)
  const decalage = useRef(0)

  const etat = useRef<{
    id: string; carte: HTMLElement; x: number; y: number; minuteur: ReturnType<typeof setTimeout> | null
    actif: boolean; y0: number; avaleClic: boolean
  } | null>(null)

  const poserDecalage = (v: number) => {
    decalage.current = v
    if (contenu.current) contenu.current.style.transform = `translateY(${-v}px)`
  }

  const fermer = useCallback(() => {
    const e = etat.current
    const depart = e?.carte.getBoundingClientRect()
    setOuvert(o => o && depart ? { ...o, depart: { top: depart.top, left: depart.left, width: depart.width, height: depart.height }, phase: 'sort' } : o)
    setTimeout(() => { setOuvert(null); setDetails(null); poserDecalage(0) }, DUREE_MS)
  }, [])

  useEffect(() => {
    const el = zone.current
    if (!actif || !el) return

    const ouvrir = () => {
      const e = etat.current
      if (!e) return
      const evt = parId.current.get(e.id)
      if (!evt) return
      e.actif = true; e.y0 = e.y; e.avaleClic = true
      const r = e.carte.getBoundingClientRect()
      poserDecalage(0)
      setOuvert({ evt, depart: { top: r.top, left: r.left, width: r.width, height: r.height }, phase: 'entre' })
      requestAnimationFrame(() => requestAnimationFrame(() => setOuvert(o => o ? { ...o, phase: 'ouvert' } : o)))
      try { navigator.vibrate?.(8) } catch { /* pas de vibreur */ }
      const deja = cacheDetails.get(evt.id)
      if (deja) setDetails(deja)
      else {
        void supabase.from('evenements')
          .select('description, prix, contact, organisateurs, lieux(nom, adresse)')
          .eq('id', evt.id).maybeSingle()
          .then(({ data }) => {
            if (!data) return
            cacheDetails.set(evt.id, data as Details)
            if (etat.current?.id === evt.id) setDetails(data as Details)
          })
      }
    }

    const onStart = (ev: TouchEvent) => {
      if (ev.touches.length !== 1) { etat.current = null; return }
      const carte = (ev.target as Element | null)?.closest?.('[data-evt-id]') as HTMLElement | null
      if (!carte || !el.contains(carte)) return
      // Les petits boutons de la cartouche (carte, favori, partage) gardent leur rôle.
      if ((ev.target as Element).closest('button')) return
      const t = ev.touches[0]
      etat.current = { id: carte.dataset.evtId!, carte, x: t.clientX, y: t.clientY, minuteur: null, actif: false, y0: t.clientY, avaleClic: false }
      etat.current.minuteur = setTimeout(ouvrir, MAINTIEN_MS)
    }

    const onMove = (ev: TouchEvent) => {
      const e = etat.current
      if (!e) return
      const t = ev.touches[0]
      if (!t) return
      if (!e.actif) {
        // Le doigt part tout de suite : c'est un défilement de la liste.
        if (Math.abs(t.clientX - e.x) > TOLERANCE_PX || Math.abs(t.clientY - e.y) > TOLERANCE_PX) {
          if (e.minuteur) clearTimeout(e.minuteur)
          etat.current = null
        }
        return
      }
      if (ev.cancelable) ev.preventDefault()
      // Monter le doigt descend dans la fiche ; le descendre remonte. Toute la
      // fiche tient dans ~45 % de la hauteur d'écran parcourue.
      const p = panneau.current, c = contenu.current
      const max = p && c ? Math.max(0, c.scrollHeight - p.clientHeight) : 0
      const k = Math.max(1, max / (window.innerHeight * 0.45))
      poserDecalage(Math.min(max, Math.max(0, (e.y0 - t.clientY) * k)))
    }

    const onEnd = () => {
      const e = etat.current
      if (!e) return
      if (e.minuteur) clearTimeout(e.minuteur)
      if (e.actif) fermer()
      // On garde l'état le temps d'avaler le clic qui suit le lâcher.
      setTimeout(() => { if (etat.current === e) etat.current = null }, 400)
    }

    // Le clic qui suit un aperçu ne doit pas ouvrir la fiche.
    const onClick = (ev: MouseEvent) => {
      if (etat.current?.avaleClic) { ev.preventDefault(); ev.stopPropagation(); etat.current.avaleClic = false }
    }
    const onMenu = (ev: Event) => { if (etat.current) ev.preventDefault() }

    el.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    el.addEventListener('click', onClick, true)
    el.addEventListener('contextmenu', onMenu)
    return () => {
      el.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
      el.removeEventListener('click', onClick, true)
      el.removeEventListener('contextmenu', onMenu)
    }
  }, [actif, fermer])

  const evt = ouvert?.evt
  const geo = ouvert ? (ouvert.phase === 'ouvert' ? cible() : ouvert.depart) : null
  const cats = evt ? eventCategories(evt) : []
  const cat = CATEGORIES[cats[0]] ?? CATEGORIES.autre
  const img = evt ? imageEvenement(evt) : null
  const lieu = (details?.lieux ?? evt?.lieux) as { nom?: string | null; adresse?: string | null } | null | undefined

  return (
    <>
      <div ref={zone} style={style}>{children}</div>
      {ouvert && evt && geo && typeof document !== 'undefined' && createPortal(
        <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 2147482000, pointerEvents: 'none' }}>
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(26,18,9,0.38)',
            backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
            opacity: ouvert.phase === 'ouvert' ? 1 : 0, transition: `opacity ${DUREE_MS}ms ease`,
          }} />
          <div ref={panneau} style={{
            position: 'absolute', top: geo.top, left: geo.left, width: geo.width, height: geo.height,
            borderRadius: ouvert.phase === 'ouvert' ? 22 : 14, overflow: 'hidden', background: '#fff',
            boxShadow: '0 18px 50px rgba(0,0,0,0.35)',
            transition: `top ${DUREE_MS}ms cubic-bezier(.2,.8,.2,1), left ${DUREE_MS}ms cubic-bezier(.2,.8,.2,1), width ${DUREE_MS}ms cubic-bezier(.2,.8,.2,1), height ${DUREE_MS}ms cubic-bezier(.2,.8,.2,1), border-radius ${DUREE_MS}ms`,
          }}>
            <div ref={contenu} style={{ willChange: 'transform' }}>
              <div style={{ position: 'relative', height: 240, background: cat.color + '33' }}>
                {img
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: evt.image_url ? (evt.image_position ?? '50% 50%') : '50% 50%', display: 'block' }} />
                  : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 56 }}>{cat.emoji}</div>}
              </div>
              <div style={{ padding: '16px 18px 28px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#fff', background: cat.color, borderRadius: 999, padding: '3px 9px' }}>{cat.label}</span>
                  {evt.lieux?.commune && <span style={{ fontSize: 12, fontWeight: 700, color: '#6B5E4E' }}>{evt.lieux.commune}</span>}
                </div>
                <h2 className="font-title" style={{ margin: 0, fontSize: 24, lineHeight: 1.12, color: '#1A1209', letterSpacing: '-0.01em' }}>{evt.titre}</h2>
                {evt.date_debut && (
                  <p style={{ margin: '10px 0 0', fontSize: 14, fontWeight: 700, color: '#2D5A3D' }}>
                    {formatEventDate(evt.date_debut, evt.date_fin)}{evt.heure ? ` · ${evt.heure.slice(0, 5)}` : ''}
                  </p>
                )}
                {lieu?.nom && <p style={{ margin: '6px 0 0', fontSize: 13, color: '#1A1209' }}>📍 {lieu.nom}{lieu.adresse ? ` — ${lieu.adresse}` : ''}</p>}
                {details?.prix && <p style={{ margin: '6px 0 0', fontSize: 13, color: '#1A1209' }}>🎟 {details.prix}</p>}
                <div style={{ height: 1, background: '#F0EAE0', margin: '14px 0' }} />
                {details
                  ? <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55, color: '#2C2419', whiteSpace: 'pre-line' }}>{details.description || 'Pas de description.'}</p>
                  : <p style={{ margin: 0, fontSize: 13, color: '#A99B89' }}>Chargement…</p>}
                {details?.organisateurs && <p style={{ margin: '14px 0 0', fontSize: 13, color: '#6B5E4E' }}>Organisé par {details.organisateurs}</p>}
                {details?.contact && <p style={{ margin: '6px 0 0', fontSize: 13, color: '#6B5E4E' }}>{details.contact}</p>}
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
