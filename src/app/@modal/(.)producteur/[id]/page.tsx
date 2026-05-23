import InterceptModalShell from '@/components/InterceptModalShell'
import ProducteurPageClient from '@/app/producteur/[id]/client'

/**
 * Intercepting route (.)producteur/[id] dans le slot @modal.
 * Active UNIQUEMENT lors d'un soft-nav vers /producteur/[id] depuis l'app.
 *
 * - Soft-nav (router.push depuis la home, /messages, etc.) → cette page
 *   rend le client en modale par-dessus la page actuelle.
 * - Lien direct / refresh sur /producteur/[id] → la vraie route
 *   src/app/producteur/[id]/page.tsx prend le relais, plein écran (avec
 *   SSR metadata OpenGraph existante).
 *
 * Réutilise EXACTEMENT le même client component que la vraie route → 0
 * duplication d'UI.
 */
export default async function ProducteurInterceptModal(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  return (
    <InterceptModalShell>
      <ProducteurPageClient id={id} />
    </InterceptModalShell>
  )
}
