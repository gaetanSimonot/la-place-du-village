'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

type Mode = 'signin' | 'signup'

interface AuthFormProps {
  /** Hook appelé juste avant une redirection externe (Google OAuth ou magic link),
   *  utile pour stocker un returnTo en sessionStorage. */
  onBeforeRedirect?: () => void
  /** Titre affiché en haut (défaut : "Connexion") */
  title?: string
  /** Compacte le layout (utile en modal) */
  compact?: boolean
}

export default function AuthForm({ onBeforeRedirect, title = 'Connexion', compact = false }: AuthFormProps) {
  const [mode, setMode]                   = useState<Mode>('signin')
  const [email, setEmail]                 = useState('')
  const [password, setPassword]           = useState('')
  const [loading, setLoading]             = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [magicLoading, setMagicLoading]   = useState(false)
  const [error, setError]                 = useState<string | null>(null)
  const [magicSent, setMagicSent]         = useState(false)

  const handleGoogle = async () => {
    setGoogleLoading(true)
    onBeforeRedirect?.()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  const handlePassword = async () => {
    const e = email.trim()
    if (!e || !password) return
    if (mode === 'signup' && password.length < 6) {
      setError('Mot de passe : 6 caractères minimum')
      return
    }
    setLoading(true); setError(null)
    if (mode === 'signup') {
      const { error: err } = await supabase.auth.signUp({
        email: e,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      })
      if (err) setError(err.message)
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({ email: e, password })
      if (err) setError(err.message)
    }
    setLoading(false)
  }

  const handleMagicLink = async () => {
    const e = email.trim()
    if (!e) {
      setError('Renseigne ton email')
      return
    }
    onBeforeRedirect?.()
    setMagicLoading(true); setError(null)
    const { error: err } = await supabase.auth.signInWithOtp({
      email: e,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback`, shouldCreateUser: true },
    })
    setMagicLoading(false)
    if (err) { setError(err.message); return }
    setMagicSent(true)
  }

  // ── État "lien envoyé" ────────────────────────────────────────────────────
  if (magicSent) {
    return (
      <div style={{ padding: '32px 20px', textAlign: 'center' }}>
        <p style={{ fontSize: 44, marginBottom: 14 }}>📬</p>
        <h3 style={{ fontWeight: 800, fontSize: 20, color: '#1A1209', marginBottom: 8, fontFamily: 'Inter, sans-serif', letterSpacing: '-0.02em' }}>
          Vérifie tes emails
        </h3>
        <p style={{ fontSize: 14, color: '#8A8A8A', lineHeight: 1.6, margin: '0 0 20px' }}>
          Un lien de connexion a été envoyé à <br />
          <strong style={{ color: '#2C1810' }}>{email}</strong>
        </p>
        <button onClick={() => { setMagicSent(false); setEmail(''); setPassword('') }}
          style={{ color: '#C4622D', background: 'none', border: 'none', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>
          Utiliser une autre adresse
        </button>
      </div>
    )
  }

  // ── Formulaire ────────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '14px 16px', borderRadius: 14,
    border: '1.5px solid #E0D8CE', fontSize: 15, outline: 'none',
    backgroundColor: '#FBF7F0', color: '#2C1810', boxSizing: 'border-box',
    fontFamily: 'Inter, sans-serif',
  }

  return (
    <div style={{ padding: compact ? '4px 0 0' : '20px 0' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {!compact && (
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%', margin: '0 auto 14px',
            backgroundColor: 'var(--primary-light)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
            </svg>
          </div>
          <h3 style={{ fontWeight: 800, fontSize: 22, color: '#1A1209', margin: '0 0 6px', fontFamily: 'Inter, sans-serif', letterSpacing: '-0.02em' }}>
            {title}
          </h3>
          <p style={{ fontSize: 13, color: '#8A8A8A', margin: 0, lineHeight: 1.5 }}>
            {mode === 'signup'
              ? 'Crée ton compte en 30 secondes.'
              : 'Suis tes événements favoris et personnalise ton expérience.'}
          </p>
        </div>
      )}

      {/* Google */}
      <button onClick={handleGoogle} disabled={googleLoading} style={{
        width: '100%', padding: '14px', borderRadius: 14, marginBottom: 14,
        backgroundColor: '#fff', border: '1.5px solid #E0D8CE',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        fontSize: 15, fontWeight: 700, cursor: googleLoading ? 'default' : 'pointer', color: '#2C1810',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)', fontFamily: 'Inter, sans-serif',
        opacity: googleLoading ? 0.7 : 1, transition: 'opacity 0.15s',
      }}>
        {googleLoading
          ? <><div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid #E0D8CE', borderTopColor: '#2C1810', animation: 'spin 0.6s linear infinite' }} /><span>Redirection…</span></>
          : <><GoogleIcon />Continuer avec Google</>}
      </button>

      {/* Divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 14px' }}>
        <div style={{ flex: 1, height: 1, backgroundColor: '#E8E0D5' }} />
        <span style={{ fontSize: 12, color: '#B0A898', fontFamily: 'Inter, sans-serif' }}>ou par email</span>
        <div style={{ flex: 1, height: 1, backgroundColor: '#E8E0D5' }} />
      </div>

      {/* Email */}
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="ton@email.com"
        style={{ ...inputStyle, marginBottom: 10 }}
      />

      {/* Password */}
      <input
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handlePassword()}
        placeholder={mode === 'signup' ? 'Mot de passe (6 caractères min)' : 'Mot de passe'}
        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
        style={{ ...inputStyle, marginBottom: 10 }}
      />

      {/* Bouton principal */}
      <button
        onClick={handlePassword}
        disabled={loading || !email.trim() || !password}
        style={{
          width: '100%', padding: '14px', borderRadius: 14,
          backgroundColor: 'var(--primary)', color: '#fff',
          fontSize: 15, fontWeight: 700, border: 'none',
          cursor: loading || !email.trim() || !password ? 'default' : 'pointer',
          opacity: loading || !email.trim() || !password ? 0.5 : 1,
          fontFamily: 'Inter, sans-serif', transition: 'opacity 0.15s',
        }}
      >
        {loading
          ? (mode === 'signup' ? 'Création…' : 'Connexion…')
          : (mode === 'signup' ? 'Créer mon compte' : 'Se connecter')}
      </button>

      {/* Erreur */}
      {error && (
        <p style={{ fontSize: 12, color: '#E53935', marginTop: 10, textAlign: 'center', fontFamily: 'Inter, sans-serif' }}>
          {error}
        </p>
      )}

      {/* Toggle signin/signup */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, gap: 8 }}>
        <button onClick={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setError(null) }}
          style={{ background: 'none', border: 'none', color: '#7A6A5A', fontSize: 12, cursor: 'pointer', fontFamily: 'Inter, sans-serif', padding: 0 }}>
          {mode === 'signin' ? 'Pas de compte ? Créer un compte' : 'Déjà inscrit ? Se connecter'}
        </button>

        <button
          onClick={handleMagicLink}
          disabled={magicLoading}
          style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 12, cursor: magicLoading ? 'default' : 'pointer', fontFamily: 'Inter, sans-serif', padding: 0, textDecoration: 'underline', opacity: magicLoading ? 0.6 : 1 }}>
          {magicLoading ? 'Envoi…' : (mode === 'signin' ? 'Mot de passe oublié ?' : 'Lien magique')}
        </button>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}
