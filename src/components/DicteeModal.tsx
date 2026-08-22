'use client'
import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

type State = 'idle' | 'recording' | 'transcribing' | 'error'

interface Props {
  onClose: () => void
  onTranscript: (text: string) => void
  /** Titre affiche. Le module cinema dicte des films, pas des evenements. */
  titre?: string
  /** A relever quand la dictee s'ouvre par-dessus une modale deja empilee. */
  zIndex?: number
}

export default function DicteeModal({ onClose, onTranscript, titre, zIndex = 600 }: Props) {
  const [state, setState] = useState<State>('idle')
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Auto-start au mount
  useEffect(() => {
    start()
    return () => {
      cleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function cleanup() {
    if (timerRef.current) clearInterval(timerRef.current)
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop() } catch {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
    }
  }

  async function start() {
    setError(null)
    setSeconds(0)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = handleStop
      recorderRef.current = recorder
      recorder.start()
      setState('recording')
      // Timer
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
    } catch {
      setError('Micro non disponible. Vérifie les permissions.')
      setState('error')
    }
  }

  async function handleStop() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setState('transcribing')
    try {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      const fd = new FormData()
      fd.append('audio', blob, 'recording.webm')
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: fd,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onTranscript(data.text ?? '')
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur transcription')
      setState('error')
    }
  }

  function arreter() {
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.stop()
    }
  }

  function annuler() {
    cleanup()
    onClose()
  }

  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  const timerStr = `${mins}:${String(secs).padStart(2, '0')}`

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex,
        background: 'rgba(26,18,9,0.78)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          width: '100%', maxWidth: 420, background: '#FFFFFF',
          borderRadius: 22, padding: '32px 24px 24px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.30)',
          textAlign: 'center',
        }}
      >
        {/* Title DM Serif */}
        <h2
          style={{
            margin: '0 0 6px',
            fontFamily: 'var(--font-display), Georgia, serif',
            fontSize: 24, fontWeight: 700, color: '#1A1209', letterSpacing: '-0.01em', lineHeight: 1.1,
          }}
        >
          {titre ?? 'Dicter ton événement'}
        </h2>
        <p style={{ margin: '0 0 24px', fontSize: 13, color: '#7A6A5A', lineHeight: 1.5 }}>
          {state === 'recording' && 'Parle naturellement. On transcrit à la fin.'}
          {state === 'transcribing' && 'Transcription en cours…'}
          {state === 'error' && (error ?? 'Erreur')}
          {state === 'idle' && 'Préparation…'}
        </p>

        {/* Mic + waveform area */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 16, marginBottom: 24,
        }}>
          {/* Mic visual */}
          <div
            style={{
              width: 96, height: 96, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: state === 'recording'
                ? 'radial-gradient(circle, #C84B2F 0%, #A03520 100%)'
                : state === 'transcribing'
                ? '#E8E0D4'
                : '#F0EAE0',
              color: state === 'recording' ? '#fff' : '#7A6A5A',
              transition: 'all 0.2s',
              boxShadow: state === 'recording' ? '0 0 0 8px rgba(200,75,47,0.15), 0 0 0 16px rgba(200,75,47,0.08)' : 'none',
              animation: state === 'recording' ? 'micPulse 1.5s ease-in-out infinite' : 'none',
            }}
          >
            {state === 'transcribing' ? (
              <span
                style={{
                  width: 32, height: 32, borderRadius: '50%',
                  border: '4px solid #7A6A5A', borderTopColor: 'transparent',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
            ) : (
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="2" width="6" height="11" rx="3"/>
                <path d="M5 10a7 7 0 0 0 14 0"/>
                <line x1="12" y1="19" x2="12" y2="22"/>
                <line x1="8" y1="22" x2="16" y2="22"/>
              </svg>
            )}
          </div>

          {/* Timer + waveform bars */}
          {state === 'recording' && (
            <>
              <div style={{
                fontFamily: 'var(--font-display), Georgia, serif',
                fontSize: 32, fontWeight: 700, color: '#C84B2F',
                fontVariantNumeric: 'tabular-nums', lineHeight: 1,
              }}>
                {timerStr}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 28 }}>
                {[...Array(7)].map((_, i) => (
                  <span
                    key={i}
                    style={{
                      width: 4, borderRadius: 2, background: '#C84B2F',
                      animation: `waveBar 0.9s ease-in-out ${i * 0.12}s infinite`,
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* CTA Arrêter */}
        {state === 'recording' && (
          <button
            onClick={arreter}
            style={{
              width: '100%', padding: 14, borderRadius: 14,
              background: '#2D5A3D', color: '#fff', border: 'none',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: '0 3px 12px rgba(45,90,61,0.25)',
              fontFamily: 'inherit',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>
            Arrêter et continuer
          </button>
        )}

        {state === 'transcribing' && (
          <button
            disabled
            style={{
              width: '100%', padding: 14, borderRadius: 14,
              background: '#D8D0C8', color: '#fff', border: 'none',
              fontSize: 14, fontWeight: 700, cursor: 'default',
              fontFamily: 'inherit',
            }}
          >
            Transcription en cours…
          </button>
        )}

        {state === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              onClick={start}
              style={{
                width: '100%', padding: 14, borderRadius: 14,
                background: '#2D5A3D', color: '#fff', border: 'none',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Réessayer
            </button>
          </div>
        )}

        {/* Annuler */}
        {state !== 'transcribing' && (
          <button
            onClick={annuler}
            style={{
              width: '100%', marginTop: 10, padding: '10px',
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 700, color: '#7A6A5A',
              fontFamily: 'inherit',
            }}
          >
            Annuler
          </button>
        )}

        {/* Hint étape suivante */}
        {state === 'recording' && (
          <p style={{ marginTop: 14, marginBottom: 0, fontSize: 11, color: '#A99B89', fontStyle: 'italic' }}>
            Tu choisiras la photo à l&apos;étape suivante.
          </p>
        )}
      </div>

      <style>{`
        @keyframes micPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.04); }
        }
        @keyframes waveBar {
          0%, 100% { height: 6px; opacity: 0.55; }
          50% { height: 28px; opacity: 1; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
