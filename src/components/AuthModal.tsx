'use client'
import { useAuthModal } from '@/contexts/AuthModalContext'
import { useAuth } from '@/hooks/useAuth'
import AuthForm from '@/components/AuthForm'

export default function AuthModal() {
  const { open, returnTo, closeAuthModal } = useAuthModal()
  const { user } = useAuth()

  if (!open || user) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        fontFamily: 'var(--font-body), sans-serif',
      }}
      onClick={closeAuthModal}
    >
      <div
        style={{
          width: '100%', maxWidth: 480, backgroundColor: '#fff',
          borderRadius: '24px 24px 0 0', padding: '24px 24px 20px',
          paddingBottom: 'max(24px, env(safe-area-inset-bottom, 24px))',
          maxHeight: '92dvh', overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#2C1810', fontFamily: 'var(--font-body), sans-serif', margin: 0 }}>
            Connexion
          </h2>
          <button onClick={closeAuthModal} style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        {/* returnTo passe au form pour etre encode dans l URL OAuth (survit
            au changement de browser context PWA <-> Safari) ET stocke en
            sessionStorage en backup pour signInWithPassword (synchrone). */}
        <AuthForm compact returnTo={returnTo} />
      </div>
    </div>
  )
}
