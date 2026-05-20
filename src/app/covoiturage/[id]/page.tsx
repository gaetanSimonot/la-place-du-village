import CovoitDetailClient from './client'

interface PageProps { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params
  return {
    title: `Covoiturage — La Place du Village`,
    description: `Trajet partagé · id ${id}`,
  }
}

export default async function CovoitDetailPage({ params }: PageProps) {
  const { id } = await params
  return <CovoitDetailClient id={id} />
}
