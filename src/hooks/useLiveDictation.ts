'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * USE LIVE DICTATION — SpeechRecognition Web API
 *
 * Dictée vocale en temps réel : on commit chaque "résultat final" au state
 * du textarea via `onFinalChunk(textToAppend)`. Le texte interim (en cours
 * de reconnaissance) est exposé séparément pour un affichage live optionnel.
 *
 * Pattern fiable (mémoire projet : feedback_speechrecognition) :
 *  - listeningRef + finalCountRef pour distinguer auto-stop vs user-stop
 *  - stopMic centralisé pour éviter les fuites
 *  - setListening(true) APRÈS rec.start() pour éviter une re-render
 *    qui déclenche un onstart fantôme
 */

interface UseLiveDictationOptions {
  lang?: string
  onFinalChunk: (text: string) => void
}

interface UseLiveDictationReturn {
  supported: boolean
  listening: boolean
  interim: string
  error: string | null
  start: () => void
  stop: () => void
  toggle: () => void
}

// Type pour SpeechRecognition (manque dans lib.dom standard)
interface SRSpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SRRecognitionEvent) => void) | null
  onerror: ((event: SRErrorEvent) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}
interface SRRecognitionEvent {
  resultIndex: number
  results: ArrayLike<SRResultList> & {
    [index: number]: SRResultList
  }
}
interface SRResultList {
  isFinal: boolean
  0: { transcript: string }
}
interface SRErrorEvent {
  error: string
}
interface SRConstructor {
  new (): SRSpeechRecognition
}

export function useLiveDictation({
  lang = 'fr-FR',
  onFinalChunk,
}: UseLiveDictationOptions): UseLiveDictationReturn {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)

  const recRef = useRef<SRSpeechRecognition | null>(null)
  const listeningRef = useRef(false)
  const finalCountRef = useRef(0)
  const onFinalChunkRef = useRef(onFinalChunk)
  onFinalChunkRef.current = onFinalChunk

  useEffect(() => {
    if (typeof window === 'undefined') return
    const w = window as unknown as {
      SpeechRecognition?: SRConstructor
      webkitSpeechRecognition?: SRConstructor
    }
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!Ctor) {
      setSupported(false)
      return
    }
    setSupported(true)
    const rec = new Ctor()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = lang

    rec.onresult = (e: SRRecognitionEvent) => {
      let interimText = ''
      for (let i = e.resultIndex; i < (e.results as unknown as { length: number }).length; i++) {
        const r = e.results[i]
        const t = r[0].transcript
        if (r.isFinal) {
          finalCountRef.current += 1
          onFinalChunkRef.current(t)
        } else {
          interimText += t
        }
      }
      setInterim(interimText)
    }

    rec.onerror = (e: SRErrorEvent) => {
      // 'no-speech' et 'aborted' sont normaux quand on stoppe — on ignore
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        setError(e.error)
      }
    }

    rec.onend = () => {
      // Si le user n'a pas demandé stop et qu'on est censé écouter, on relance
      // (Chrome arrête seul après ~60s de silence). Sinon on confirme l'arrêt.
      if (listeningRef.current) {
        try { rec.start() } catch { /* déjà actif, ignore */ }
      } else {
        setListening(false)
        setInterim('')
      }
    }

    recRef.current = rec

    return () => {
      listeningRef.current = false
      try { rec.abort() } catch {}
      recRef.current = null
    }
  }, [lang])

  const start = useCallback(() => {
    const rec = recRef.current
    if (!rec) return
    setError(null)
    finalCountRef.current = 0
    listeningRef.current = true
    try {
      rec.start()
      setListening(true)
    } catch {
      // déjà démarré
      setListening(true)
    }
  }, [])

  const stop = useCallback(() => {
    const rec = recRef.current
    if (!rec) return
    listeningRef.current = false
    try { rec.stop() } catch {}
    // onend se chargera de setListening(false)
  }, [])

  const toggle = useCallback(() => {
    if (listeningRef.current) stop()
    else start()
  }, [start, stop])

  return { supported, listening, interim, error, start, stop, toggle }
}
