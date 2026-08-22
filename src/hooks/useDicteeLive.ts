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
 * ── POURQUOI TOUT S'ÉCRIVAIT EN DOUBLE, ET PARFOIS EN TRIPLE ──────────
 *
 * `continuous` ne tient pas : un silence clôt la session, et il faut relancer
 * pour poursuivre la phrase. La faute était de relancer LA MÊME INSTANCE.
 *
 * Sur Chrome et sur Android, une instance relancée ne repart pas d'une
 * ardoise vierge : son `results` CONSERVE les phrases déjà dites. On avait
 * donc, d'un côté, le texte des sessions précédentes qu'on avait encaissé —
 * et de l'autre, ces mêmes phrases à nouveau présentes dans `results`. Les
 * deux s'additionnaient. Une relance doublait, deux relances triplaient.
 *
 * D'où la règle : UNE SESSION, UNE INSTANCE. Chaque relance crée une
 * reconnaissance neuve, dont le `results` est forcément vide, et l'ancienne
 * est détachée de ses événements avant. Le texte, lui, se reconstruit
 * entièrement à chaque événement — jamais par addition — si bien que relire
 * deux fois le même résultat produit exactement le même texte.
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
  /** Ce qu'il y avait dans le champ avant qu'on prenne la parole. */
  const baseRef = useRef('')
  /** Ce que les sessions déjà closes ont produit — figé, jamais relu. */
  const closesRef = useRef('')
  /** Le définitif de la session EN COURS, retenu pour le moment où elle se clôt. */
  const figeRef = useRef('')
  const onTexteRef = useRef(onTexte)
  onTexteRef.current = onTexte

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    setSupporte(!!SR)
  }, [])

  /** Détache une instance : plus aucun de ses événements ne nous parvient. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detacher = (rec: any) => {
    if (!rec) return
    rec.onresult = null
    rec.onend = null
    rec.onerror = null
    try { rec.abort?.() } catch { /* ignore */ }
    try { rec.stop() } catch { /* déjà arrêtée */ }
  }

  const arreter = useCallback(() => {
    actifRef.current = false
    setActif(false)
    const rec = recRef.current
    recRef.current = null
    detacher(rec)
  }, [])

  /** Renonce : le champ revient à ce qu'il était avant la prise de parole. */
  const annuler = useCallback(() => {
    arreter()
    onTexteRef.current(baseRef.current)
  }, [arreter])

  /**
   * Ouvre UNE session. Rappelée telle quelle à chaque silence, elle crée à
   * chaque fois une instance neuve — c'est ce qui garantit un `results` vide.
   */
  const ouvrirSession = useCallback((): boolean => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return false

    // Toute instance qui traînerait continuerait d'écrire dans le champ en
    // parallèle de la nouvelle : c'est l'autre façon de tout dire en double.
    if (recRef.current) { const vieille = recRef.current; recRef.current = null; detacher(vieille) }

    const rec = new SR()
    rec.lang = 'fr-FR'
    rec.continuous = true
    // C'est CE réglage qui fait apparaître les mots pendant qu'on parle.
    rec.interimResults = true

    /** Tout ce que CETTE session a produit, définitif et provisoire. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionEntiere = (e: any): { fige: string; encours: string } => {
      let fige = '', encours = ''
      for (let i = 0; i < e.results.length; i++) {
        const bout = (e.results[i][0]?.transcript ?? '').trim()
        if (!bout) continue
        if (e.results[i].isFinal) fige += (fige ? ' ' : '') + bout
        else encours += (encours ? ' ' : '') + bout
      }
      return { fige, encours }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      // Une instance détachée ne doit plus rien écrire, même si un dernier
      // événement était déjà en vol.
      if (recRef.current !== rec) return
      const { fige, encours } = sessionEntiere(e)
      figeRef.current = fige
      const courant = [fige, encours].filter(Boolean).join(' ')
      onTexteRef.current(
        [baseRef.current, closesRef.current, courant].map(x => x.trim()).filter(Boolean).join(' '),
      )
    }

    rec.onend = () => {
      if (recRef.current !== rec || !actifRef.current) return
      // L'événement de fin ne porte pas les résultats : on encaisse ce que le
      // dernier `onresult` avait figé, puis on repart sur une instance NEUVE.
      if (figeRef.current) {
        closesRef.current = [closesRef.current, figeRef.current].filter(Boolean).join(' ')
        figeRef.current = ''
      }
      recRef.current = null
      detacher(rec)
      // Un souffle avant de rouvrir : relancer dans la foulée de `onend` fait
      // parfois échouer le démarrage sur Android.
      setTimeout(() => { if (actifRef.current) ouvrirSession() }, 80)
    }

    rec.onerror = () => { /* micro refusé ou réseau : `actif` retombera */ }

    try {
      recRef.current = rec
      rec.start()
      return true
    } catch {
      recRef.current = null
      return false
    }
  }, [])

  const demarrer = useCallback((texteActuel: string) => {
    if (actifRef.current) return false
    baseRef.current = texteActuel.trim()
    closesRef.current = ''
    figeRef.current = ''
    // Marqué actif AVANT le démarrage : un double appui rapproché ne doit pas
    // pouvoir ouvrir deux reconnaissances.
    actifRef.current = true
    setActif(true)
    const ok = ouvrirSession()
    if (!ok) { actifRef.current = false; setActif(false) }
    return ok
  }, [ouvrirSession])

  useEffect(() => () => { arreter() }, [arreter])

  return { supporte, actif, demarrer, arreter, annuler }
}
