import InterceptModalShell from '@/components/InterceptModalShell'
import EtablissementPageClient from '@/app/etablissement/[id]/client'

/**
 * Intercepting route (.)etablissement/[id] dans le slot @modal.
 * Active UNIQUEMENT lors d'un soft-nav vers /etablissement/[id].
 *
 * Refresh / lien direct → la vraie route src/app/etablissement/[id]/page.tsx
 * prend le relais plein écran (SSR metadata OpenGraph intacte).
 */
export default async function EtablissementInterceptModal(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  return (
    <InterceptModalShell match="/etablissement/">
      <EtablissementPageClient id={id} />
    </InterceptModalShell>
  )
}
