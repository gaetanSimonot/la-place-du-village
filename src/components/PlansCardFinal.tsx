'use client'

/**
 * Carte slim « Découvrir les plans » insérée dans l'accueil (HubView).
 * Argument : promotions illimitées, rentabilisé dès la 1re promo. Dismissable.
 */
export default function PlansCardFinal({ onClick, onDismiss }: {
  onClick: () => void
  /** Si fourni, affiche la croix de masquage. */
  onDismiss?: () => void
}) {
  return (
    <div style={{ padding: '12px 16px 0' }}>
      <div style={{ position: 'relative', background: 'linear-gradient(135deg, #FFF7EE 0%, #FFEAD8 100%)', border: '1px solid #F2D3BC', borderRadius: 14, overflow: 'hidden' }}>
        <button onClick={onClick} style={{ width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 11, padding: '11px 12px', paddingRight: onDismiss ? 34 : 12, fontFamily: 'Inter, sans-serif' }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: '#FFF0E5', color: '#E8622A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12" /><rect x="2" y="7" width="20" height="5" /><line x1="12" y1="22" x2="12" y2="7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" /></svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1209', lineHeight: 1.25, letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: 6 }}>
              Promotions illimitées
              <span style={{ fontSize: 8.5, fontWeight: 800, color: '#2D5A3D', background: '#E8F2EB', padding: '2px 6px', borderRadius: 999, letterSpacing: '0.05em' }}>RENTABLE</span>
            </div>
            <div style={{ fontSize: 11, color: '#7A6A5A', marginTop: 1.5 }}>
              Remboursé dès ta 1ʳᵉ promo — <b style={{ color: '#C0440A' }}>dès 4,99 €/mois</b>
            </div>
          </div>
          <span style={{ flexShrink: 0, color: '#E8622A' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="13 6 19 12 13 18" /></svg>
          </span>
        </button>
        {onDismiss && (
          <button aria-label="Masquer" onClick={onDismiss} style={{ position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: '50%', background: 'rgba(255,255,255,0.7)', border: 'none', cursor: 'pointer', color: '#A89B8C', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        )}
      </div>
    </div>
  )
}
