'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useAuthModal } from '@/contexts/AuthModalContext'
import AnnonceForm from '@/components/AnnonceForm'
import BottomNavBar from '@/components/BottomNavBar'

export default function NouvelleAnnonceClient() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const { openAuthModal } = useAuthModal()

  useEffect(() => {
    if (!loading && !user) openAuthModal('/annonces/nouvelle')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user])

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2EBE0' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '4px solid #E0D8CE', borderTopColor: '#2D5A3D', animation: 'spin 0.7s linear infinite' }} />
      </div>
    )
  }
  if (!user) {
    return (
      <div style={{ minHeight: '100dvh', backgroundColor: '#F2EBE0', padding: 40, textAlign: 'center', fontFamily: 'Inter, sans-serif' }}>
        <p style={{ color: '#8A7A6A' }}>Connectez-vous pour publier une annonce.</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', backgroundColor: '#F2EBE0', fontFamily: 'Inter, sans-serif', paddingBottom: 80 }}>
      {/* Header sticky */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: 'rgba(242,235,224,0.92)', backdropFilter: 'blur(10px)', padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #E5DDD2' }}>
        <button onClick={() => router.back()} style={{
          width: 34, height: 34, borderRadius: 10,
          backgroundColor: 'rgba(255,255,255,0.8)', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#2D5A3D', fontSize: 18, flexShrink: 0,
          boxShadow: '0 1px 6px rgba(0,0,0,0.1)',
        }}>←</button>
        <h1 style={{ flex: 1, margin: 0, fontSize: 18, fontWeight: 800, color: '#2C1810' }}>Publier une annonce</h1>
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: '20px 18px', boxShadow: '0 1px 8px rgba(44,28,16,0.08)' }}>
          <AnnonceForm onSuccess={id => router.push(`/annonces/${id}`)} />
        </div>
      </div>

      <BottomNavBar />
    </div>
  )
}
