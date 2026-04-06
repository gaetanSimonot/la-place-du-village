'use client'
import { useState, useRef, useCallback } from 'react'

interface Props {
  onTranscript: (text: string) => void
  className?: string
}

type State = 'idle' | 'recording' | 'transcribing'

export default function MicButton({ onTranscript, className = '' }: Props) {
  const [state, setState] = useState<State>('idle')
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef   = useRef<Blob[]>([])

  const start = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []

      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        setState('transcribing')
        try {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
          const fd = new FormData()
          fd.append('audio', blob, 'recording.webm')
          const res  = await fetch('/api/transcribe', { method: 'POST', body: fd })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error)
          onTranscript(data.text)
        } catch (e: unknown) {
          setError(e instanceof Error ? e.message : 'Erreur transcription')
        } finally {
          setState('idle')
        }
      }

      recorderRef.current = recorder
      recorder.start()
      setState('recording')
    } catch {
      setError('Micro non disponible')
      setState('idle')
    }
  }, [onTranscript])

  const stop = useCallback(() => {
    recorderRef.current?.stop()
  }, [])

  const handleClick = () => {
    if (state === 'idle')      start()
    else if (state === 'recording') stop()
  }

  return (
    <span className={`inline-flex flex-col items-center ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        title={state === 'idle' ? 'Dicter' : state === 'recording' ? 'Arrêter' : 'Transcription…'}
        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
          state === 'recording'
            ? 'bg-red-500 animate-pulse shadow-lg shadow-red-200'
            : state === 'transcribing'
            ? 'bg-gray-200 cursor-not-allowed'
            : 'bg-[#FBF7F0] border border-[#E8E0D5] hover:border-[#C4622D] hover:text-[#C4622D]'
        } text-gray-500`}
      >
        {state === 'transcribing' ? (
          <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
        ) : state === 'recording' ? (
          /* Carré stop */
          <svg width="10" height="10" viewBox="0 0 10 10" fill="white"><rect width="10" height="10" rx="1"/></svg>
        ) : (
          /* Micro */
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="2" width="6" height="11" rx="3"/>
            <path d="M5 10a7 7 0 0 0 14 0"/>
            <line x1="12" y1="19" x2="12" y2="22"/>
            <line x1="8"  y1="22" x2="16" y2="22"/>
          </svg>
        )}
      </button>
      {error && <span className="text-xs text-red-400 mt-1 whitespace-nowrap">{error}</span>}
    </span>
  )
}
