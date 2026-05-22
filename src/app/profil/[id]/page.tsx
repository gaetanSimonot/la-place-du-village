'use client'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import ProfilPublicView from '@/components/profil/ProfilPublicView'

export default function ProfilPage({ params }: { params: { id: string } }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  // Si on visite SON propre profil, redirect vers /profil (vue own complète)
  // — sinon on tomberait sur la vue publique de soi-même alors qu'il faut
  // la vue propriétaire avec actions modifier, paramètres, messagerie, etc.
  useEffect(() => {
    if (!loading && user?.id === params.id) {
      router.replace('/profil')
    }
  }, [loading, user, params.id, router])

  if (loading || user?.id === params.id) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-creme">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-bord border-t-primary" />
      </div>
    )
  }

  return <ProfilPublicView viewedUserId={params.id} />
}
