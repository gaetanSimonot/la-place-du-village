'use client'
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useState } from 'react'
import type { EtablissementCard, EtablissementType } from '@/lib/types'
import { ETAB_TYPES } from '@/lib/etablissement-types'
import { supabase } from '@/lib/supabase'
import { signalerFavori } from '@/hooks/useFavori'
import { shareLink } from '@/lib/share'
import type { PromoDecouverte } from '@/components/DiscoverPromoModal'

/**
 * LE MODE « BONS PLANS » DE LA CARTE (page d'accueil, molette du haut).
 *
 * Comme le transport, il se superpose sans entrer dans `appMode` : la carte
 * montre un point par commerce qui a un bon plan, la feuille du bas un
 * en-tête (compte + catégories) et la liste. On ne quitte pas la carte pour
 * regarder : « Découvrir » ouvre la fenêtre du bon plan par-dessus. Seul
 * « J'en profite » mène à la page Bons plans (`lienBonPlan(id, true)`), où
 * vivent la confirmation sur place et le quota — rien n'est recopié ici.
 */

export interface PromoCarte extends PromoDecouverte {
  etablissement: (NonNullable<PromoDecouverte['etablissement']> & { lat: number | null; lng: number | null }) | null
}

export const lienBonPlan = (id: string, profiter = false) =>
  `/promotions?promo=${encodeURIComponent(id)}${profiter ? '&profiter=1' : ''}`

/** Un point par commerce localisé ; un commerce à trois bons plans = un point. */
export function etabsDesBonsPlans(promos: PromoCarte[]): EtablissementCard[] {
  const vus = new Map<string, EtablissementCard>()
  for (const p of promos) {
    const e = p.etablissement
    if (!e || e.lat == null || e.lng == null || !e.type || vus.has(e.id)) continue
    vus.set(e.id, {
      id: e.id, type: e.type, nom: e.nom, commune: e.commune, lat: e.lat, lng: e.lng,
      photos: e.photos ?? [], note_google: null, is_featured: false, statut: 'publie',
      description_courte: null, plan: 'pro',
    })
  }
  return Array.from(vus.values())
}

/**
 * Ce que la vignette de la carte montre d'un point : le bon plan (le premier
 * du commerce), pas la fiche du commerce. Clé : id du commerce.
 */
export interface VignetteBonPlan {
  titre: string
  image: string | null
  commerce: string
  commune: string | null
}

export function vignettesDesBonsPlans(promos: PromoCarte[]): Record<string, VignetteBonPlan> {
  const v: Record<string, VignetteBonPlan> = {}
  for (const p of promos) {
    const e = p.etablissement
    if (!e || v[e.id]) continue
    v[e.id] = { titre: p.title, image: p.display_image_url ?? e.photos?.[0] ?? null, commerce: e.nom, commune: e.commune }
  }
  return v
}

/**
 * La punaise des bons plans : orange, bordée de blanc, un cadeau dedans.
 * Les deux cartes (Google, MapLibre) la posent à la place de celle du commerce.
 */
export const PIN_BON_PLAN = { largeur: 32, hauteur: 40 }
export function pinBonPlanSvg(choisi: boolean): string {
  const svg = `<svg width="32" height="40" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
    <path d="M16 2C8.8 2 3 7.8 3 15c0 9.6 13 23 13 23s13-13.4 13-23C29 7.8 23.2 2 16 2z" fill="${choisi ? '#C2410C' : '#E8622A'}" stroke="white" stroke-width="${choisi ? 3 : 2.5}"/>
    <g fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <rect x="9.5" y="11.5" width="13" height="4" rx="0.8"/>
      <path d="M10.8 15.5v6.5h10.4v-6.5"/>
      <line x1="16" y1="11.5" x2="16" y2="22"/>
      <path d="M16 11.5c-1.2-2.6-4.6-2.9-4.6-0.9 0 1.1 2.1 0.9 4.6 0.9z"/>
      <path d="M16 11.5c1.2-2.6 4.6-2.9 4.6-0.9 0 1.1-2.1 0.9-4.6 0.9z"/>
    </g>
  </svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/** La vignette d'un bon plan sur la carte : le bon plan en miniature + « Découvrir ». */
export function CarteVignetteBonPlan({ v, bord, onDecouvrir, onFermer }: {
  v: VignetteBonPlan
  bord: string
  onDecouvrir: () => void
  onFermer: () => void
}) {
  return (
    <div style={{ position: 'relative', width: 210, overflow: 'visible', fontFamily: 'var(--font-body), sans-serif' }}>
      <button onClick={onFermer}
        style={{ position: 'absolute', top: -10, right: -10, zIndex: 10, width: 22, height: 22, borderRadius: '50%', backgroundColor: '#fff', border: '1.5px solid #ddd', boxShadow: '0 1px 5px rgba(0,0,0,0.22)', cursor: 'pointer', color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, padding: 0 }}>✕</button>
      <div onClick={onDecouvrir}
        style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff', border: `2.5px solid ${bord}`, cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.18)' }}>
        <div style={{ width: '100%', height: 95, position: 'relative', backgroundColor: '#FFF0E5', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {v.image
            ? <img src={v.image} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: 36 }}>🎁</span>}
          <span style={{ position: 'absolute', left: 6, top: 6, fontSize: 9, fontWeight: 800, letterSpacing: '.06em', color: '#fff', backgroundColor: '#E8622A', borderRadius: 999, padding: '2px 7px' }}>
            BON PLAN
          </span>
        </div>
        <div style={{ padding: '8px 10px 10px' }}>
          <p style={{ fontWeight: 800, fontSize: 13, color: '#1A1209', margin: '0 0 2px', lineHeight: 1.3 }}>{v.titre}</p>
          <p style={{ fontSize: 11, color: '#6B5E4E', margin: '0 0 7px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {v.commerce}{v.commune ? ` · ${v.commune}` : ''}
          </p>
          <button style={{ display: 'block', width: '100%', textAlign: 'center', padding: '7px', borderRadius: 8, backgroundColor: '#E8622A', color: '#fff', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            Découvrir
          </button>
        </div>
      </div>
    </div>
  )
}

/** Les catégories présentes parmi les bons plans — celles de la page Bons plans. */
export function typesDesBonsPlans(promos: PromoCarte[]): EtablissementType[] {
  const set = new Set<EtablissementType>()
  promos.forEach(p => { if (p.etablissement?.type) set.add(p.etablissement.type) })
  return Array.from(set)
}

/**
 * Les favoris « bons plans » de la personne — la même liste que la page Bons
 * plans (même route, même signal pour la barre du bas).
 */
export function useFavorisBonsPlans(userId: string | null, demanderConnexion: () => void, actif: boolean) {
  const [favIds, setFavIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!userId || !actif) { if (!userId) setFavIds(new Set()); return }
    let vivant = true
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const r = await fetch('/api/profile/promo-favorites', { headers: { Authorization: `Bearer ${session.access_token}` } }).catch(() => null)
      if (vivant && r && r.ok) { const d = await r.json(); setFavIds(new Set(d.ids ?? [])) }
    })()
    return () => { vivant = false }
  }, [userId, actif])

  const basculer = useCallback(async (promoId: string) => {
    if (!userId) { demanderConnexion(); return }
    const etait = favIds.has(promoId)
    setFavIds(prev => { const n = new Set(prev); if (etait) n.delete(promoId); else n.add(promoId); return n })
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const r = await fetch(`/api/promotions/${promoId}/favorite`, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } }).catch(() => null)
    if (!r || !r.ok) setFavIds(prev => { const n = new Set(prev); if (etait) n.add(promoId); else n.delete(promoId); return n })
    else signalerFavori('promo', promoId, !etait)
  }, [userId, demanderConnexion, favIds])

  return { favIds, basculer }
}

/** L'en-tête de la feuille, comme celui des événements : le compte, puis les catégories. */
export function EnteteBonsPlans({ total, types, typeActif, onType }: {
  total: number
  types: EtablissementType[]
  typeActif: EtablissementType | null
  onType: (t: EtablissementType | null) => void
}) {
  const pastille = (actif: boolean): React.CSSProperties => ({
    flexShrink: 0, whiteSpace: 'nowrap', borderRadius: 999, padding: '7px 13px', cursor: 'pointer',
    fontFamily: 'var(--font-body), sans-serif', fontSize: 12, fontWeight: 700,
    border: actif ? '1.5px solid #C84B2F' : '1px solid #E6DCC8',
    background: actif ? '#FFF0E5' : '#fff', color: actif ? '#C84B2F' : '#7A6A5A',
  })
  return (
    <div style={{ userSelect: 'none' }}>
      <div style={{ padding: '2px 16px 8px', textAlign: 'center', fontFamily: 'var(--font-body), sans-serif', fontSize: 13, color: '#7A6A5A' }}>
        <span style={{ fontWeight: 800, fontSize: 15, color: '#1A1209' }}>{total}</span>
        {' '}bon{total > 1 ? 's' : ''} plan{total > 1 ? 's' : ''}
        <span style={{ opacity: 0.5 }}> · </span>
        <span style={{ fontSize: 11, color: '#9E9089' }}>près de chez vous</span>
      </div>
      {types.length > 1 && (
        <div className="pdv-hscroll" style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '0 16px 12px', touchAction: 'pan-x', scrollbarWidth: 'none' }}>
          <button type="button" onClick={() => onType(null)} style={pastille(typeActif === null)}>Tout</button>
          {types.map(t => (
            <button key={t} type="button" onClick={() => onType(t)} style={pastille(typeActif === t)}>
              {ETAB_TYPES[t]?.label ?? t}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const BTN: React.CSSProperties = {
  width: 26, height: 26, borderRadius: 7, backgroundColor: '#EDE8DF', border: 'none', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B5E4E', flexShrink: 0,
}

export function ListeBonsPlans({ promos, chargement, favIds, onFavori, onLocaliser, onDecouvrir }: {
  promos: PromoCarte[]
  chargement: boolean
  favIds: Set<string>
  onFavori: (id: string) => void
  onLocaliser: (p: PromoCarte) => void
  onDecouvrir: (p: PromoCarte) => void
}) {
  if (chargement && !promos.length) {
    return <p style={{ padding: '28px 22px', textAlign: 'center', color: '#7A6A5A', fontSize: 13, margin: 0 }}>Chargement…</p>
  }
  if (!promos.length) {
    return (
      <div style={{ padding: '28px 22px', textAlign: 'center', fontFamily: 'var(--font-body), sans-serif' }}>
        <p style={{ fontWeight: 700, color: '#1A1209', fontSize: 15, margin: '0 0 6px' }}>Aucun bon plan ici</p>
        <p style={{ color: '#7A6A5A', fontSize: 13, lineHeight: 1.5, margin: 0 }}>
          Les commerçants en publient régulièrement : reviens bientôt.
        </p>
      </div>
    )
  }
  return (
    // Pas de marge sur les côtés : la feuille pose déjà la sienne, celle des
    // cartes d'événements — les tuiles ont ainsi la même largeur qu'elles.
    <div style={{ padding: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 10, fontFamily: 'var(--font-body), sans-serif' }}>
      {promos.map(p => {
        const img = p.display_image_url ?? p.etablissement?.photos?.[0] ?? null
        const fav = favIds.has(p.id)
        const localisable = p.etablissement?.lat != null && p.etablissement?.lng != null
        return (
          // Une div et non un bouton : les boutons d'action vivent dedans.
          <div
            key={p.id}
            role="button"
            tabIndex={0}
            onClick={() => onDecouvrir(p)}
            onKeyDown={e => { if (e.key === 'Enter') onDecouvrir(p) }}
            style={{
              display: 'flex', alignItems: 'stretch', gap: 12, textAlign: 'left',
              background: '#fff', border: '1px solid #EDE8E0', borderRadius: 14, overflow: 'hidden',
              cursor: 'pointer', boxShadow: '0 1px 6px rgba(44,28,16,.06)',
            }}
          >
            <div style={{ width: 92, minHeight: 96, flexShrink: 0, background: '#FFF0E5', position: 'relative' }}>
              {img
                ? <img src={img} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🎁</span>}
            </div>
            <div style={{ flex: 1, minWidth: 0, padding: '9px 10px 9px 0', display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ alignSelf: 'flex-start', fontSize: 9, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: '#fff', background: '#C84B2F', borderRadius: 999, padding: '2px 7px' }}>
                Bon plan
              </span>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#1A1209', lineHeight: 1.25 }}>{p.title}</span>
              {p.etablissement && (
                <span style={{ fontSize: 11.5, color: '#7A6A5A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.etablissement.nom}{p.etablissement.commune ? ` · ${p.etablissement.commune}` : ''}
                </span>
              )}
              {/* Bas : Découvrir + les actions des événements */}
              <div style={{ marginTop: 'auto', paddingTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <button type="button"
                  onClick={e => { e.stopPropagation(); onDecouvrir(p) }}
                  style={{ border: '1px solid #2D5A3D', background: '#fff', color: '#2D5A3D', borderRadius: 999, padding: '4px 11px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}>
                  Découvrir
                </button>
                <div style={{ display: 'flex', gap: 4 }}>
                  {localisable && (
                    <button type="button" aria-label="Voir sur la carte" style={BTN}
                      onClick={e => { e.stopPropagation(); onLocaliser(p) }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                        <circle cx="12" cy="9" r="2.5" fill="currentColor" stroke="none"/>
                      </svg>
                    </button>
                  )}
                  <button type="button" aria-label={fav ? 'Retirer des favoris' : 'Ajouter aux favoris'} style={BTN}
                    onClick={e => { e.stopPropagation(); onFavori(p.id) }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill={fav ? '#EC407A' : 'none'} stroke={fav ? '#EC407A' : '#6B5E4E'} strokeWidth="2">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                    </svg>
                  </button>
                  <button type="button" aria-label="Partager ce bon plan" style={BTN}
                    onClick={e => {
                      e.stopPropagation()
                      shareLink({
                        title: `${p.title} — La Place du Village`,
                        text:  `${p.title}${p.etablissement ? ' chez ' + p.etablissement.nom : ''}`,
                        url:   `https://laplaceduvillage.app/promotions?id=${p.id}`,
                      })
                    }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6B5E4E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
