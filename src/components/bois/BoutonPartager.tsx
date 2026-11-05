'use client'
import { toast } from 'sonner'

/**
 * Partager — la feuille de partage du téléphone, ou le lien copié à défaut.
 * Même icône que sur les fiches film et spectacle ; le cadre est celui des
 * boutons de la barre du haut des rubriques (40 px, coins arrondis).
 */
export default function BoutonPartager({ titre, url }: { titre: string; url: () => string }) {
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
      style={{ border: '1px solid var(--uni-line)', background: 'var(--uni-panel)', color: 'var(--uni-ink)' }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="13 6 19 12 13 18" /><path d="M19 12H8a4 4 0 0 0-4 4v2" />
      </svg>
    </button>
  )
}
