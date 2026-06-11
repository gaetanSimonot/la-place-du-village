'use client'
import { createPortal } from 'react-dom'

/**
 * Modal affichée quand un membre GRATUIT a déjà utilisé sa promo du mois.
 * Montre la promo refusée + les autres promos du mois (verrouillées) et pousse
 * vers l'abonnement Habitant. Aucun prix de promo calculé/affiché.
 */
export interface LockedPromo { title: string; where: string; imageUrl: string | null }

const HUES = ['#D4B179', '#C9A56B', '#9CB489', '#A85138', '#B89D6E', '#8FA9C0']
function shade(hex: string, p: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + p))
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + p))
  const b = Math.max(0, Math.min(255, (n & 255) + p))
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
}

function Lock({ s = 13 }: { s?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
}

function Tile({ title, where, imageUrl, hue, highlight }: LockedPromo & { hue: string; highlight?: boolean }) {
  return (
    <div style={{ flex: '0 0 132px', scrollSnapAlign: 'start', borderRadius: 12, overflow: 'hidden', position: 'relative', border: highlight ? '2px solid #E8622A' : '1px solid #F0E8DC', background: '#fff', boxShadow: highlight ? '0 4px 14px rgba(232,98,42,0.22)' : 'none' }}>
      <div style={{ position: 'relative', height: 70 }}>
        {imageUrl
          ? <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'saturate(0.9)' }} />
          : <div style={{ width: '100%', height: '100%', background: `repeating-linear-gradient(135deg, ${hue} 0 10px, ${shade(hue, -7)} 10px 20px), ${hue}` }} />}
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,18,9,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(255,255,255,0.92)', color: '#1A1209', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Lock /></span>
        </div>
        <span style={{ position: 'absolute', top: 6, left: 6, background: '#E8622A', color: '#fff', fontSize: 7.5, fontWeight: 800, letterSpacing: '0.06em', padding: '2px 5px', borderRadius: 4 }}>{highlight ? 'TA PROMO' : 'BON PLAN'}</span>
      </div>
      <div style={{ padding: '7px 9px 9px' }}>
        <div style={{ fontSize: 11.5, fontWeight: 800, color: '#1A1209', lineHeight: 1.2, minHeight: 28, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{title}</div>
        <div style={{ fontSize: 9.5, color: '#7A6A5A', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{where}</div>
      </div>
    </div>
  )
}

export default function QuotaPromoModal({ promoTitle, promoWhere, others, otherCount, loading, onSubscribe, onClose }: {
  promoTitle: string
  promoWhere: string
  others: LockedPromo[]
  otherCount: number
  loading?: boolean
  onSubscribe: () => void
  onClose: () => void
}) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(15,10,5,0.62)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
      <div onClick={e => e.stopPropagation()} style={{ position: 'relative', width: '100%', maxWidth: 480, background: '#FBFAF7', borderRadius: '24px 24px 0 0', paddingBottom: 'max(18px, env(safe-area-inset-bottom, 18px))', boxShadow: '0 -8px 40px rgba(0,0,0,0.22)' }}>
        <div style={{ width: 44, height: 4, borderRadius: 2, background: '#D1CCC4', margin: '12px auto 0' }} />
        <button aria-label="Fermer" onClick={onClose} style={{ position: 'absolute', top: 14, right: 16, width: 30, height: 30, borderRadius: '50%', background: '#F0EAE0', border: 'none', cursor: 'pointer', color: '#7A6A5A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>

        <div style={{ padding: '16px 24px 0', textAlign: 'center' }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.14em', color: '#C0440A' }}>PROMO GRATUITE DU MOIS DÉJÀ UTILISÉE</div>
          <h2 style={{ margin: '8px 0 0', fontFamily: 'var(--font-dm-serif), Georgia, serif', fontSize: 24, lineHeight: 1.12, color: '#1A1209', letterSpacing: '-0.02em' }}>
            Débloque cette promo<br /><span style={{ color: '#E8622A' }}>et toutes les autres&nbsp;!</span>
          </h2>
          <p style={{ margin: '8px auto 0', fontSize: 13, color: '#5B4A3A', lineHeight: 1.5, maxWidth: 300 }}>
            Une seule promo et c&apos;est <b style={{ color: '#1A1209' }}>déjà rentabilisé</b>. Ensuite, profite de tout le mois sans compteur.
          </p>
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ padding: '0 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: '#7A6A5A', letterSpacing: '0.08em' }}>CE QUI T&apos;ATTEND CE MOIS</span>
            <span style={{ fontSize: 10, fontWeight: 800, color: '#E8622A' }}>{otherCount + 1} promos verrouillées</span>
          </div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '0 16px 4px', scrollSnapType: 'x mandatory' }} className="pdv-hscroll">
            <Tile title={promoTitle} where={promoWhere} imageUrl={null} hue="#E8B27A" highlight />
            {others.map((o, i) => <Tile key={i} {...o} hue={HUES[i % HUES.length]} />)}
            <div style={{ flex: '0 0 8px' }} />
          </div>
        </div>

        <div style={{ padding: '18px 16px 0' }}>
          <button onClick={onSubscribe} disabled={loading} style={{ width: '100%', padding: '15px', borderRadius: 15, border: 'none', background: '#E8622A', color: '#fff', fontSize: 15, fontWeight: 800, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1, boxShadow: '0 8px 24px rgba(232,98,42,0.40)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}>
            {loading ? '…' : <>Tout débloquer — 4,99 €/mois
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="13 6 19 12 13 18" /></svg></>}
          </button>
          <div style={{ textAlign: 'center', marginTop: 9, fontSize: 11.5, fontWeight: 600, color: '#A89B8C' }}>Sans engagement · résiliable en 1 clic · le reste en bonus</div>
        </div>

        <button onClick={onClose} style={{ display: 'block', margin: '10px auto 0', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#9A8A7A', fontFamily: 'inherit' }}>
          Non merci, plus tard
        </button>
      </div>
    </div>,
    document.body,
  )
}
