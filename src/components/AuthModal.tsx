'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthModal } from '@/contexts/AuthModalContext'
import { useAuth } from '@/hooks/useAuth'

export default function AuthModal() {
  const { open, closeAuthModal } = useAuthModal()
  const { user } = useAuth()
  const [email, setEmail]           = useState('')
  const [sent, setSent]             = useState(false)
  const [loading, setLoading]       = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  if (!open || user) return null

  const handleGoogle = async () => {
    setGoogleLoading(true)
    try { sessionStorage.setItem('pdv-login-pending', '1') } catch {}
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  const handleMagicLink = async () => {
    if (!email.trim()) return
    try { sessionStorage.setItem('pdv-login-pending', '1') } catch {}
    setLoading(true); setError(null)
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    setLoading(false)
    if (err) { setError(err.message); return }
    setSent(true)
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        fontFamily: 'Inter, sans-serif',
      }}
      onClick={closeAuthModal}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <div
        style={{
          width: '100%', maxWidth: 480, backgroundColor: '#fff',
          borderRadius: '24px 24px 0 0', padding: '28px 24px',
          paddingBottom: 'max(28px, env(safe-area-inset-bottom, 28px))',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#2C1810', fontFamily: 'Inter, sans-serif', margin: 0 }}>
            Connexion
          </h2>
          <button onClick={closeAuthModal} style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        {sent ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <p style={{ fontSize: 32, marginBottom: 12 }}>📬</p>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#2C1810', marginBottom: 6 }}>Lien envoyé !</p>
            <p style={{ fontSize: 13, color: '#6B7280' }}>Vérifie ta boîte mail et clique sur le lien de connexion.</p>
          </div>
        ) : (
          <>
            <button
              onClick={handleGoogle}
              disabled={googleLoading}
              style={{
                width: '100%', padding: '14px', borderRadius: 14,
                border: '1.5px solid #E5E7EB', backgroundColor: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                fontSize: 14, fontWeight: 600, color: '#374151', cursor: googleLoading ? 'default' : 'pointer',
                marginBottom: 16, opacity: googleLoading ? 0.7 : 1, transition: 'opacity 0.15s',
              }}
            >
              {googleLoading ? (
                <><div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid #E5E7EB', borderTopColor: '#374151', animation: 'spin 0.6s linear infinite' }} /><span>Redirection…</span></>
              ) : (
                <><svg width="18" height="18" viewBox="0 0 48 48">
                  <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.2 6.9 29.4 4.8 24 4.8 12.7 4.8 3.6 13.9 3.6 25.2S12.7 45.5 24 45.5s20.4-9.1 20.4-20.4c0-1.4-.1-2.7-.4-4z"/>
                  <path fill="#FF3D00" d="M6.3 15.7l6.6 4.8C14.5 17 18.9 14 24 14c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.2 7.8 29.4 5.7 24 5.7c-7.7 0-14.4 4-17.7 10z"/>
                  <path fill="#4CAF50" d="M24 44.3c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.5 26.7 36.5 24 36.5c-5.1 0-9.5-3.3-11.2-7.9l-6.5 5C9.9 40.3 16.5 44.3 24 44.3z"/>
                  <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.7 2-2 3.8-3.7 5l6.2 5.2C40.3 35 43.6 30.5 43.6 24c0-1.4-.1-2.7-.4-4z"/>
                </svg>Continuer avec Google</>
              )}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1, height: 1, backgroundColor: '#E5E7EB' }} />
              <span style={{ fontSize: 12, color: '#9CA3AF' }}>ou par email</span>
              <div style={{ flex: 1, height: 1, backgroundColor: '#E5E7EB' }} />
            </div>

            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleMagicLink()}
              placeholder="ton@email.com"
              style={{
                width: '100%', padding: '13px 14px', borderRadius: 12,
                border: '1.5px solid #E5E7EB', fontSize: 14, color: '#2C1810',
                outline: 'none', boxSizing: 'border-box', marginBottom: 12,
              }}
            />

            {error && <p style={{ fontSize: 12, color: '#EF4444', marginBottom: 10 }}>{error}</p>}

            <button
              onClick={handleMagicLink}
              disabled={loading || !email.trim()}
              style={{
                width: '100%', padding: '14px', borderRadius: 14,
                backgroundColor: '#C4622D', color: '#fff',
                fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer',
                opacity: loading || !email.trim() ? 0.5 : 1,
              }}
            >
              {loading ? 'Envoi…' : 'Recevoir un lien magique'}
            </button>

            <p style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'center', marginTop: 14, lineHeight: 1.5 }}>
              Pas de mot de passe. Un lien de connexion sera envoyé à ton email.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
