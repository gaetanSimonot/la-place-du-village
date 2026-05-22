import type { Viewport } from 'next'

/**
 * Viewport scopé au segment /conversations/[id] uniquement.
 *
 * - interactiveWidget: 'resizes-content' → quand le clavier mobile ouvre,
 *   le viewport (et 100dvh) shrink réellement à la zone visible.
 *   Pas global → ne casse pas les autres pages de l'app.
 * - viewportFit: 'cover' → permet env(safe-area-inset-*) sur iOS.
 *
 * Sur iOS Safari, interactive-widget n'est pas encore supporté → le hook
 * useAppViewportHeight (visualViewport.height → --app-vh) prend le relais.
 */
export const viewport: Viewport = {
  interactiveWidget: 'resizes-content',
  viewportFit:       'cover',
}

export default function ConversationLayout({ children }: { children: React.ReactNode }) {
  return children
}
