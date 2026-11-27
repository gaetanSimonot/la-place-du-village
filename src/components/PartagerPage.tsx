'use client'

/**
 * « Partager » de l'en-tête des pages d'entrée : même bouton que l'en-tête de
 * la carte, mais il partage LA PAGE (« Que faire à Ganges »), pas l'app.
 */
export default function PartagerPage({ titre }: { titre: string }) {
  const partager = () => {
    const url = window.location.href
    if (navigator.share) navigator.share({ title: titre, url }).catch(() => {})
    else navigator.clipboard.writeText(url).catch(() => {})
  }
  return (
    <button
      onClick={partager}
      aria-label="Partager cette page"
      style={{
        display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
        height: 34, padding: '0 11px', borderRadius: 999,
        background: '#F7F1E6', border: '1px solid #E6DCC8', color: '#2D5A3D',
        fontFamily: 'var(--font-body), sans-serif', fontWeight: 800, fontSize: 12.5,
        whiteSpace: 'nowrap',
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
        <polyline points="16 6 12 2 8 6"/>
        <line x1="12" y1="2" x2="12" y2="15"/>
      </svg>
      Partager
    </button>
  )
}
