'use client'
import { toast } from 'sonner'

/**
 * Partager — la feuille de partage du téléphone, ou le lien copié à défaut.
 * Même icône que sur les fiches film et spectacle. `surPhoto` : posé sur
 * l'en-tête photo du guide, en verre sombre plutôt qu'en blanc.
 */
export default function BoutonPartager({ titre, url, surPhoto }: { titre: string; url: () => string; surPhoto?: boolean }) {
  async function partager() {
    const lien = url()
    try {
      if (navigator.share) await navigator.share({ title: titre, url: lien })
      else { await navigator.clipboard.writeText(lien); toast.success('Lien copié.') }
    } catch { /* partage annulé */ }
  }
  return (
    <button onClick={partager} aria-label="Partager"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
      style={surPhoto
        ? { border: '1px solid rgba(255,255,255,.28)', background: 'rgba(16,20,17,.35)', color: '#FFFFFF', backdropFilter: 'blur(6px)' }
        : { border: '1px solid var(--uni-line)', background: 'var(--uni-panel)', color: 'var(--uni-ink)' }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="13 6 19 12 13 18" /><path d="M19 12H8a4 4 0 0 0-4 4v2" />
      </svg>
    </button>
  )
}
