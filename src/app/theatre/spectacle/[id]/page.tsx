import SpectacleClient from './client'

/** /theatre/spectacle/[id] — la fiche d'un spectacle et toutes ses dates. */
export default async function SpectaclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <SpectacleClient id={id} />
}
