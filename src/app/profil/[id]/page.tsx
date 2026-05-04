import ProfilPageClient from './client'

export default function ProfilPage({ params }: { params: { id: string } }) {
  return <ProfilPageClient id={params.id} />
}
