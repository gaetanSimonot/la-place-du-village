'use client'
import { useEffect, useState } from 'react'

/* Données réelles renvoyées par /api/splash */
interface SplashData {
  hero?: string | null
  aujourdhui?: { today: number; weekend: number; debates: number } | null
  caFaitParler?: { id: string; titre: string; comments: number; votes: number } | null
  journal?: { numero: number; titre: string; deck: string } | null
  bonPlan?: { id: string; titre: string; sous: string | null; image: string | null; etab: string | null } | null
  vuAujourdhui?: { id: string; titre: string; auteur: string; image: string | null } | null
}

const NAV_H = 62

/* Icônes RÉUTILISÉES du site (EmbedPicker / moments / messagerie), recolorées */
const SVG = { width: 26, height: 26, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const Icons = {
  calendar: <svg {...SVG}><rect x="3" y="5" width="18" height="16" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="16" y1="3" x2="16" y2="7" /></svg>,
  chat: <svg {...SVG}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" /><line x1="8" y1="11.5" x2="8.01" y2="11.5" /><line x1="12" y1="11.5" x2="12.01" y2="11.5" /><line x1="16" y1="11.5" x2="16.01" y2="11.5" /></svg>,
  book: <svg {...SVG}><path d="M4 4h12a2 2 0 0 1 2 2v13a1 1 0 0 1-1 1H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" /><path d="M18 8h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2" /><line x1="6" y1="8" x2="14" y2="8" /><line x1="6" y1="12" x2="14" y2="12" /><line x1="6" y1="16" x2="11" y2="16" /></svg>,
  tag: <svg {...SVG}><path d="M20 12V8H4v4" /><path d="M20 12v8H4v-8" /><line x1="12" y1="8" x2="12" y2="20" /><path d="M8 8a2 2 0 0 1 2-4c1.5 0 2 2 2 4-2 0-4 0-4-2 0-2 2-2 2-2" /></svg>,
  camera: <svg {...SVG}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>,
}

type RubProps = {
  kicker: string; color: string; iconBg: string; icon: React.ReactNode
  title: string; subParts?: (string | null)[]; thumb?: string | null; onClick: () => void
}
function Rubrique({ kicker, color, iconBg, icon, title, subParts, thumb, onClick }: RubProps) {
  const parts = (subParts ?? []).filter(Boolean) as string[]
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 14,
        background: '#fff', border: 'none', borderRadius: 16,
        padding: '14px 16px', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-jakarta), sans-serif',
      }}
    >
      <span style={{ width: 50, height: 50, flexShrink: 0, borderRadius: 14, background: iconBg, color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color }}>{kicker}</span>
        <span style={{ display: 'block', marginTop: 3, fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', color: '#241C14', lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        {parts.length > 0 && (
          <span style={{ display: 'block', marginTop: 3, fontSize: 12.5, fontWeight: 500, color: '#9A8A78', lineHeight: 1.4 }}>
            {parts.map((p, i) => (
              <span key={i}>{i > 0 && <span style={{ color, fontWeight: 700, margin: '0 6px' }}>•</span>}{p}</span>
            ))}
          </span>
        )}
      </span>
      {thumb && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt="" style={{ width: 64, height: 64, flexShrink: 0, borderRadius: 14, objectFit: 'cover' }} />
      )}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A99B89" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="9 6 15 12 9 18" /></svg>
    </button>
  )
}

export default function EditorialSplash({ onExplore, onRubrique }: { onExplore: () => void; onRubrique: (href: string) => void }) {
  const [d, setD] = useState<SplashData | null>(null)
  useEffect(() => {
    fetch('/api/splash').then(r => (r.ok ? r.json() : null)).then(data => { if (data) setD(data) }).catch(() => {})
  }, [])

  const auj = d?.aujourdhui

  return (
    <div className="pdv-hscroll" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: NAV_H, zIndex: 60, background: '#FBF7F0', overflowY: 'auto', WebkitOverflowScrolling: 'touch', fontFamily: 'var(--font-jakarta), sans-serif' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: 'max(12px, env(safe-area-inset-top, 12px)) 16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* En-tête : logo (multiply) + recherche + cloche */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 2 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/splash-logo-v2.png" alt="La Place du Village" style={{ height: 50, width: 'auto', maxWidth: '64%', objectFit: 'contain', display: 'block' }} />
          <div style={{ flex: 1 }} />
          <button aria-label="Rechercher" onClick={() => onRubrique('/?tab=carte')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1A1209', padding: 4 }}>
            <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" /></svg>
          </button>
          <button aria-label="Notifications" onClick={() => onRubrique('/?tab=profil')} style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', color: '#1A1209', padding: 4 }}>
            <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
            <span style={{ position: 'absolute', top: 3, right: 3, width: 8, height: 8, borderRadius: 4, background: '#E8622A', border: '1.5px solid #FBF7F0' }} />
          </button>
        </div>

        {/* Héro */}
        <div style={{ borderRadius: 20, overflow: 'hidden', height: 210, background: '#E6DECE' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={d?.hero || '/og/home.jpg'} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </div>

        {/* Rubriques */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Rubrique
            kicker="Aujourd'hui" color="#E8622A" iconBg="#FFF0E5" icon={Icons.calendar}
            title={auj ? `${auj.today} événement${auj.today > 1 ? 's' : ''} aujourd'hui` : "L'agenda du village"}
            subParts={auj ? [auj.weekend ? `${auj.weekend} ce week-end` : null, auj.debates ? `${auj.debates} débat${auj.debates > 1 ? 's' : ''} actif${auj.debates > 1 ? 's' : ''}` : null] : []}
            onClick={() => onRubrique('/?tab=carte')}
          />
          <Rubrique
            kicker="Ça fait parler" color="#7C3AED" iconBg="#F3EEFB" icon={Icons.chat}
            title={d?.caFaitParler?.titre ?? 'La place publique'}
            subParts={d?.caFaitParler ? [`${d.caFaitParler.comments} commentaire${d.caFaitParler.comments > 1 ? 's' : ''}`, `${d.caFaitParler.votes} vote${d.caFaitParler.votes > 1 ? 's' : ''}`] : ['Rejoignez les discussions du village']}
            onClick={() => onRubrique(d?.caFaitParler ? `/forum/${d.caFaitParler.id}` : '/forum')}
          />
          <Rubrique
            kicker="Dans le journal" color="#3A5BC7" iconBg="#EEF2FE" icon={Icons.book}
            title={d?.journal ? `Le Journal Hebdo n°${d.journal.numero} est sorti` : 'Le Journal du Village'}
            subParts={[d?.journal?.deck || (d?.journal ? d.journal.titre : 'Le meilleur du village, chaque semaine')]}
            onClick={() => onRubrique('/journal')}
          />
          <Rubrique
            kicker="Bon plan du jour" color="#2D5A3D" iconBg="#E8F2EB" icon={Icons.tag}
            title={d?.bonPlan?.titre ?? 'Les bons plans du coin'}
            subParts={[d?.bonPlan?.etab ?? (d?.bonPlan ? null : 'Les offres des commerçants partenaires')]}
            thumb={d?.bonPlan?.image ?? null}
            onClick={() => onRubrique(d?.bonPlan ? `/promotions?id=${d.bonPlan.id}` : '/promotions')}
          />
          <Rubrique
            kicker="Vu aujourd'hui" color="#D99100" iconBg="#FEF6E0" icon={Icons.camera}
            title={d?.vuAujourdhui?.titre ?? 'En ce moment au village'}
            subParts={[d?.vuAujourdhui ? `Photo de ${d.vuAujourdhui.auteur}` : 'Les moments partagés par les habitants']}
            thumb={d?.vuAujourdhui?.image ?? null}
            onClick={() => onRubrique('/')}
          />
        </div>

        {/* Explorer le village → accueil */}
        <button
          onClick={onExplore}
          style={{ marginTop: 6, width: '100%', display: 'flex', alignItems: 'center', gap: 14, background: '#234A30', border: 'none', borderRadius: 18, padding: '16px 18px', cursor: 'pointer', textAlign: 'left' }}
        >
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontFamily: 'var(--font-dm-serif), Georgia, serif', fontSize: 23, fontWeight: 700, color: '#fff', lineHeight: 1.1 }}>Explorer le village</span>
            <span style={{ display: 'block', marginTop: 2, fontSize: 13, color: 'rgba(255,255,255,0.82)' }}>Voir tous les événements, annonces, articles…</span>
          </span>
          <span style={{ width: 42, height: 42, flexShrink: 0, borderRadius: 21, background: '#fff', color: '#234A30', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
          </span>
        </button>

      </div>
    </div>
  )
}
