'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

/* Données renvoyées par /api/splash (sources réelles) */
interface SplashData {
  aujourdhui?: { today: number; weekend: number; debates: number } | null
  caFaitParler?: { id: string; titre: string; comments: number; votes: number } | null
  journal?: { numero: number; titre: string; deck: string } | null
  bonPlan?: { id: string; titre: string; sous: string | null; image: string | null; etab: string | null } | null
  vuAujourdhui?: { id: string; titre: string; auteur: string; image: string | null } | null
}

type RubProps = {
  kicker: string; color: string; iconBg: string; icon: React.ReactNode
  title: string; subtitle?: string | null; thumb?: string | null; onClick: () => void
}

function Rubrique({ kicker, color, iconBg, icon, title, subtitle, thumb, onClick }: RubProps) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 14,
        background: '#fff', border: '1px solid #F0EAE0', borderRadius: 18,
        padding: '14px 16px', cursor: 'pointer', textAlign: 'left',
        boxShadow: '0 1px 4px rgba(44,28,16,0.04)', fontFamily: 'Inter, sans-serif',
      }}
    >
      <span style={{ width: 54, height: 54, flexShrink: 0, borderRadius: 15, background: iconBg, color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color }}>{kicker}</span>
        <span style={{ display: 'block', marginTop: 3, fontSize: 17, fontWeight: 800, color: '#1A1209', lineHeight: 1.2 }}>{title}</span>
        {subtitle && <span style={{ display: 'block', marginTop: 3, fontSize: 13, color: '#7A6A5A', lineHeight: 1.4 }}>{subtitle}</span>}
      </span>
      {thumb && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt="" style={{ width: 64, height: 64, flexShrink: 0, borderRadius: 14, objectFit: 'cover' }} />
      )}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A99B89" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <polyline points="9 6 15 12 9 18" />
      </svg>
    </button>
  )
}

const ic = { w: 26, h: 26, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

export default function EditorialSplash() {
  const router = useRouter()
  const [visible, setVisible] = useState(true)   // obligatoire pour l'instant
  const [d, setD] = useState<SplashData | null>(null)

  useEffect(() => {
    fetch('/api/splash').then(r => (r.ok ? r.json() : null)).then(data => { if (data) setD(data) }).catch(() => {})
  }, [])

  if (!visible) return null
  const exit = (href?: string) => { setVisible(false); if (href) router.push(href) }

  const auj = d?.aujourdhui
  const aujSub = auj
    ? [auj.weekend ? `${auj.weekend} ce week-end` : null, auj.debates ? `${auj.debates} débat${auj.debates > 1 ? 's' : ''} actif${auj.debates > 1 ? 's' : ''}` : null].filter(Boolean).join('  •  ') || null
    : null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#FBF7F0', overflowY: 'auto', WebkitOverflowScrolling: 'touch', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: 'max(14px, env(safe-area-inset-top, 14px)) 16px 28px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* En-tête */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 4 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" style={{ width: 46, height: 46, borderRadius: 10, objectFit: 'contain', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0, lineHeight: 1 }}>
            <div style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif', fontSize: 18, fontWeight: 800, letterSpacing: '0.02em' }}>
              <span style={{ color: '#2D5A3D' }}>LA PLACE </span><span style={{ color: '#E8622A' }}>DU VILLAGE</span>
            </div>
            <div style={{ fontFamily: 'var(--font-caveat), cursive', fontSize: 15, color: '#7A6A5A', marginTop: 2 }}>Ganges et alentours</div>
          </div>
          <button aria-label="Rechercher" onClick={() => exit('/?tab=carte')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1A1209', padding: 4 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" /></svg>
          </button>
          <button aria-label="Notifications" onClick={() => exit('/?tab=profil')} style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', color: '#1A1209', padding: 4 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
            <span style={{ position: 'absolute', top: 3, right: 3, width: 8, height: 8, borderRadius: 4, background: '#E8622A', border: '1.5px solid #FBF7F0' }} />
          </button>
        </div>

        {/* Héro */}
        <div style={{ borderRadius: 20, overflow: 'hidden', height: 210, background: '#E6DECE', boxShadow: '0 4px 18px rgba(44,28,16,0.10)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/og/home.jpg" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>

        {/* Rubriques */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 2 }}>
          <Rubrique
            kicker="Aujourd'hui" color="#E8622A" iconBg="#FFF0E5"
            icon={<svg {...ic}><rect x="3" y="5" width="18" height="16" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="16" y1="3" x2="16" y2="7" /><polyline points="9 15 11 17 15 13" /></svg>}
            title={auj ? `${auj.today} événement${auj.today > 1 ? 's' : ''} aujourd'hui` : 'L\'agenda du village'}
            subtitle={aujSub}
            onClick={() => exit('/?tab=carte')}
          />
          <Rubrique
            kicker="Ça fait parler" color="#7C3AED" iconBg="#F3EEFB"
            icon={<svg {...ic}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" /><line x1="8.5" y1="12" x2="8.51" y2="12" /><line x1="12" y1="12" x2="12.01" y2="12" /><line x1="15.5" y1="12" x2="15.51" y2="12" /></svg>}
            title={d?.caFaitParler?.titre ?? 'La place publique'}
            subtitle={d?.caFaitParler ? `${d.caFaitParler.comments} commentaire${d.caFaitParler.comments > 1 ? 's' : ''}  •  ${d.caFaitParler.votes} vote${d.caFaitParler.votes > 1 ? 's' : ''}` : 'Rejoignez les discussions du village'}
            onClick={() => exit(d?.caFaitParler ? `/forum/${d.caFaitParler.id}` : '/forum')}
          />
          <Rubrique
            kicker="Dans le journal" color="#3A5BC7" iconBg="#EEF2FE"
            icon={<svg {...ic}><path d="M2 4h7a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5H2z" /><path d="M22 4h-7a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2.5H22z" /></svg>}
            title={d?.journal ? 'Le Journal Hebdo est sorti' : 'Le Journal du Village'}
            subtitle={d?.journal?.deck || (d?.journal ? d.journal.titre : 'Le meilleur du village, chaque semaine')}
            onClick={() => exit('/journal')}
          />
          <Rubrique
            kicker="Bon plan du jour" color="#2D5A3D" iconBg="#E8F2EB"
            icon={<svg {...ic}><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>}
            title={d?.bonPlan ? (d.bonPlan.etab ? `${d.bonPlan.titre}` : d.bonPlan.titre) : 'Les bons plans du coin'}
            subtitle={d?.bonPlan ? (d.bonPlan.sous ?? d.bonPlan.etab) : 'Les offres des commerçants partenaires'}
            thumb={d?.bonPlan?.image ?? null}
            onClick={() => exit(d?.bonPlan ? `/promotions?id=${d.bonPlan.id}` : '/promotions')}
          />
          <Rubrique
            kicker="Vu aujourd'hui" color="#D99100" iconBg="#FEF6E0"
            icon={<svg {...ic}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>}
            title={d?.vuAujourdhui?.titre ?? 'En ce moment au village'}
            subtitle={d?.vuAujourdhui ? `Photo de ${d.vuAujourdhui.auteur}` : 'Les moments partagés par les habitants'}
            thumb={d?.vuAujourdhui?.image ?? null}
            onClick={() => exit('/')}
          />
        </div>

        {/* Explorer le village */}
        <button
          onClick={() => exit()}
          style={{
            marginTop: 8, width: '100%', display: 'flex', alignItems: 'center', gap: 14,
            background: '#2D5A3D', border: 'none', borderRadius: 18, padding: '16px 18px',
            cursor: 'pointer', textAlign: 'left', boxShadow: '0 6px 18px rgba(45,90,61,0.30)',
          }}
        >
          <span style={{ fontSize: 30, flexShrink: 0 }}>🏡</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontFamily: 'var(--font-dm-serif), Georgia, serif', fontSize: 22, fontWeight: 700, color: '#fff', lineHeight: 1.1 }}>Explorer le village</span>
            <span style={{ display: 'block', marginTop: 2, fontSize: 13, color: 'rgba(255,255,255,0.82)' }}>Voir tous les événements, annonces, articles…</span>
          </span>
          <span style={{ width: 42, height: 42, flexShrink: 0, borderRadius: 21, background: '#fff', color: '#2D5A3D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18" /></svg>
          </span>
        </button>

      </div>
    </div>
  )
}
