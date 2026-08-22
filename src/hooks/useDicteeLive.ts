'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * DICTÉE EN DIRECT — les mots s'écrivent pendant qu'on parle.
 *
 * Deux façons de dicter coexistent dans l'app, et elles ne font pas la même
 * chose :
 *
 *   — Whisper (MicButton) enregistre, envoie, et rend le texte À LA FIN. Très
 *     fidèle, mais on parle dans le vide et on attend.
 *   — La reconnaissance du navigateur écrit AU FUR ET À MESURE. Moins fidèle
 *     sur les noms propres, mais on voit ce qu'on dit, donc on se corrige.
 *
 * Pour une conversation, voir les mots arriver vaut mieux qu'une transcription
 * parfaite qu'on découvre après coup. On prend donc la seconde quand le
 * navigateur la propose (Chrome, Android), et l'appelant garde Whisper en
 * repli — Firefox et iOS ne l'implémentent pas.
 *
 * Le pattern (listeningRef, compteur de résultats définitifs, arrêt
 * centralisé) est celui déjà éprouvé dans CaptureProducteur : sans lui, la
 * reconnaissance se relance toute seule ou duplique les phrases.
 */

interface Options {
  /** Appelé à chaque évolution : texte de base + ce qui a été dicté. */
  onTexte: (texte: string) => void
}

export function useDicteeLive({ onTexte }: Options) {
  const [actif, setActif] = useState(false)
  const [supporte, setSupporte] = useState(false)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef = useRef<any>(null)
  const actifRef = useRef(false)
  const finalsRef = useRef(0)
  /** Ce qu'il y avait déjà dans le champ avant qu'on prenne la parole. */
  const baseRef = useRef('')
  const acquisRef = useRef('')
  const onTexteRef = useRef(onTexte)
  onTexteRef.current = onTexte

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    setSupporte(!!SR)
  }, [])

  const arreter = useCallback(() => {
    actifRef.current = false
    setActif(false)
    const rec = recRef.current
    recRef.current = null
    if (rec) {
      rec.onend = null
      rec.onresult = null
      try { rec.stop() } catch { /* déjà arrêté */ }
    }
  }, [])

  /** Renonce : le champ revient à ce qu'il était avant la prise de parole. */
  const annuler = useCallback(() => {
    arreter()
    onTexteRef.current(baseRef.current)
  }, [arreter])

  const demarrer = useCallback((texteActuel: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR || actifRef.current) return false

    baseRef.current = texteActuel
    acquisRef.current = ''
    finalsRef.current = 0

    const rec = new SR()
    rec.lang = 'fr-FR'
    rec.continuous = true
    // C'est CE réglage qui fait apparaître les mots pendant qu'on parle.
    rec.interimResults = true

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let encours = ''
      for (let i = finalsRef.current; i < e.results.length; i++) {
        const bout = e.results[i][0]?.transcript ?? ''
        if (e.results[i].isFinal) {
          acquisRef.current += (acquisRef.current ? ' ' : '') + bout.trim()
          finalsRef.current = i + 1
        } else {
          encours += bout
        }
      }
      const dicte = [acquisRef.current, encours.trim()].filter(Boolean).join(' ')
      const base = baseRef.current
      onTexteRef.current(base ? `${base} ${dicte}` : dicte)
    }

    // Un silence coupe la reconnaissance : on la relance tant qu'on n'a pas
    // demandé l'arrêt, sinon la dictée s'interrompt au milieu d'une phrase.
    rec.onend = () => { if (actifRef.current) { try { rec.start() } catch { /* noop */ } } }
    rec.onerror = () => { /* micro refusé ou réseau : l'appelant verra `actif` retomber */ }

    try {
      rec.start()
      recRef.current = rec
      actifRef.current = true
      setActif(true)
      return true
    } catch {
      return false
    }
  }, [])

  useEffect(() => () => { arreter() }, [arreter])

  return { supporte, actif, demarrer, arreter, annuler }
}
