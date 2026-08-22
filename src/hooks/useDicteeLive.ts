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
 * ── ON RECONSTRUIT, ON N'ACCUMULE JAMAIS ──────────────────────────────
 *
 * Première version : chaque résultat définitif était AJOUTÉ à un texte en
 * cours. Tout se réécrivait deux ou trois fois, et voici pourquoi.
 *
 * `continuous` ne dure pas : un silence termine la session, et il faut la
 * relancer pour poursuivre la phrase. À chaque relance, `e.results` repart de
 * zéro — mais le compteur de résultats déjà lus, lui, ne repartait pas. Selon
 * le navigateur, des résultats déjà encaissés étaient donc relus et rajoutés
 * une deuxième, puis une troisième fois.
 *
 * Le remède n'est pas de mieux compter : c'est de ne plus compter du tout. À
 * chaque événement on RECONSTRUIT le texte entier — ce qui précédait la prise
 * de parole, les sessions déjà closes, puis la totalité de la session en
 * cours. Relire deux fois le même résultat produit alors exactement le même
 * texte. La duplication devient impossible, pas seulement improbable.
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

  /** Assemble sans jamais coller deux espaces ni un espace en tête. */
  const composer = (courant: string) =>
    [baseRef.current, closesRef.current, courant]
      .map(x => x.trim()).filter(Boolean).join(' ')

  /** Détache une instance : plus aucun de ses événements ne nous parvient. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detacher = (rec: any) => {
    if (!rec) return
    rec.onresult = null
    rec.onend = null
    rec.onerror = null
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

  const demarrer = useCallback((texteActuel: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return false

    // Une instance qui traînerait continuerait d'écrire dans le champ en
    // parallèle de la nouvelle : c'est l'autre façon de tout dire en double.
    if (recRef.current) { detacher(recRef.current); recRef.current = null }

    baseRef.current = texteActuel.trim()
    closesRef.current = ''
    figeRef.current = ''

    const rec = new SR()
    rec.lang = 'fr-FR'
    rec.continuous = true
    // C'est CE réglage qui fait apparaître les mots pendant qu'on parle.
    rec.interimResults = true

    /** Tout ce que la session en cours a produit, définitif et provisoire. */
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
      onTexteRef.current(composer([fige, encours].filter(Boolean).join(' ')))
    }

    /**
     * Un silence clôt la session. On encaisse ce qu'elle a produit, PUIS on
     * relance : la suivante repartira d'un `results` vide, et comme on ne
     * conserve aucun compteur d'un cycle à l'autre, rien ne peut être relu.
     */
    rec.onend = () => {
      if (recRef.current !== rec || !actifRef.current) return
      // L'événement de fin ne porte pas les résultats : on encaisse ce que le
      // dernier `onresult` avait figé, et on remet le compteur de la session
      // suivante à zéro.
      if (figeRef.current) {
        closesRef.current = [closesRef.current, figeRef.current].filter(Boolean).join(' ')
        figeRef.current = ''
      }
      try { rec.start() } catch { /* le navigateur a refusé : on s'arrête là */ }
    }

    rec.onerror = () => { /* micro refusé ou réseau : `actif` retombera */ }

    try {
      // Marqué actif AVANT le démarrage : un double appui rapproché ne doit
      // pas pouvoir ouvrir deux reconnaissances.
      recRef.current = rec
      actifRef.current = true
      setActif(true)
      rec.start()
      return true
    } catch {
      recRef.current = null
      actifRef.current = false
      setActif(false)
      return false
    }
  }, [])

  useEffect(() => () => { arreter() }, [arreter])

  return { supporte, actif, demarrer, arreter, annuler }
}
