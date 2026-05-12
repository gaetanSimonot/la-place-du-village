'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import AnnonceForm from '@/components/AnnonceForm'

export default function NouvelleAnnonceClient() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const { openAuthModal } = useAuthModal()

  useEffect(() => {
    if (!loading && !user) openAuthModal('/annonces/nouvelle')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user])

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#8A7A6A' }}>Chargement…</div>
  }
  if (!user) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#8A7A6A' }}>
        Connectez-vous pour publier une annonce.
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', backgroundColor: '#FDFAF6', padding: '16px', paddingBottom: 120 }}>
      <Link href="/annonces" style={{ fontSize: 14, color: '#2D5A3D', fontWeight: 700, textDecoration: 'none' }}>
        ← Retour
      </Link>
      <h1 style={{ margin: '12px 0 16px', fontSize: 22, fontWeight: 900, color: '#1C1917' }}>
        Publier une annonce
      </h1>

      <AnnonceForm onSuccess={id => router.push(`/annonces/${id}`)} />
    </div>
  )
}
