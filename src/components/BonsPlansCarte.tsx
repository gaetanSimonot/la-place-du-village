'use client'
import type { EtablissementCard, EtablissementType } from '@/lib/types'

/**
 * LE MODE « BONS PLANS » DE LA CARTE (page d'accueil, molette du haut).
 *
 * Comme le transport, il se superpose sans entrer dans `appMode` : la carte
 * montre un point par commerce qui a un bon plan, la feuille du bas la liste
 * des bons plans. Toucher l'un ou l'autre ouvre le bon plan sur la page Bons
 * plans (`/promotions?promo=<id>`), où vivent la fenêtre « Découvrir » et le
 * bouton « J'en profite » — rien n'est recopié ici.
 */

export interface PromoCarte {
  id: string
  title: string
  display_image_url: string | null
  etablissement: {
    id: string
    nom: string
    commune: string | null
    photos: string[] | null
    type: EtablissementType | null
    lat: number | null
    lng: number | null
  } | null
}

export const lienBonPlan = (id: string) => `/promotions?promo=${encodeURIComponent(id)}`

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

export function ListeBonsPlans({ promos, chargement, onOuvrir }: {
  promos: PromoCarte[]
  chargement: boolean
  onOuvrir: (id: string) => void
}) {
  if (chargement && !promos.length) {
    return <p style={{ padding: '28px 22px', textAlign: 'center', color: '#7A6A5A', fontSize: 13, margin: 0 }}>Chargement…</p>
  }
  if (!promos.length) {
    return (
      <div style={{ padding: '28px 22px', textAlign: 'center', fontFamily: 'var(--font-body), sans-serif' }}>
        <p style={{ fontWeight: 700, color: '#1A1209', fontSize: 15, margin: '0 0 6px' }}>Aucun bon plan en cours</p>
        <p style={{ color: '#7A6A5A', fontSize: 13, lineHeight: 1.5, margin: 0 }}>
          Les commerçants en publient régulièrement : reviens bientôt.
        </p>
      </div>
    )
  }
  return (
    <div style={{ padding: '4px 16px 24px', display: 'flex', flexDirection: 'column', gap: 10, fontFamily: 'var(--font-body), sans-serif' }}>
      <p style={{ margin: '0 2px 2px', fontSize: 12, fontWeight: 700, color: '#7A6A5A' }}>
        {promos.length} bon{promos.length > 1 ? 's' : ''} plan{promos.length > 1 ? 's' : ''} près de chez vous
      </p>
      {promos.map(p => {
        const img = p.display_image_url ?? p.etablissement?.photos?.[0] ?? null
        return (
          <button
            key={p.id}
            onClick={() => onOuvrir(p.id)}
            style={{
              display: 'flex', alignItems: 'stretch', gap: 12, width: '100%', padding: 0, textAlign: 'left',
              background: '#fff', border: '1px solid #EDE8E0', borderRadius: 14, overflow: 'hidden',
              cursor: 'pointer', boxShadow: '0 1px 6px rgba(44,28,16,.06)',
            }}
          >
            <div style={{ width: 88, minHeight: 76, flexShrink: 0, background: '#FFF0E5', position: 'relative' }}>
              {img
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={img} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🎁</span>}
            </div>
            <div style={{ flex: 1, minWidth: 0, padding: '10px 12px 10px 0', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3 }}>
              <span style={{ alignSelf: 'flex-start', fontSize: 9, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: '#fff', background: '#C84B2F', borderRadius: 999, padding: '2px 7px' }}>
                Bon plan
              </span>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#1A1209', lineHeight: 1.25 }}>{p.title}</span>
              {p.etablissement && (
                <span style={{ fontSize: 11.5, color: '#7A6A5A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.etablissement.nom}{p.etablissement.commune ? ` · ${p.etablissement.commune}` : ''}
                </span>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
