'use client'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { abonnerMiseAJour, miseAJourEnCours } from '@/lib/miseAJour'

/**
 * « ⟳ Mise à jour » — à côté de « Aujourd'hui », le temps que la page servie
 * de mémoire (ou du paquet de la première fois) soit rafraîchie et la
 * version vérifiée.
 *
 * Il n'apparaît qu'au-delà d'un instant (APRES_MS) : un rafraîchissement
 * rapide ne fait rien clignoter. Une fois là, il reste au moins RESTE_MS,
 * pour ne pas être un éclair illisible.
 */
const APRES_MS = 400
const RESTE_MS = 700

export default function IndicateurMiseAJour({ couleur }: { couleur: string }) {
  const actif = useSyncExternalStore(abonnerMiseAJour, miseAJourEnCours, () => false)
  const [montre, setMontre] = useState(false)
  const [depuis, setDepuis] = useState(0)

  useEffect(() => {
    if (actif && !montre) {
      const t = setTimeout(() => { setMontre(true); setDepuis(Date.now()) }, APRES_MS)
      return () => clearTimeout(t)
    }
    if (!actif && montre) {
      const t = setTimeout(() => setMontre(false), Math.max(0, RESTE_MS - (Date.now() - depuis)))
      return () => clearTimeout(t)
    }
  }, [actif, montre, depuis])

  return (
    <span aria-live="polite"
      className="ml-2 inline-flex items-center gap-1 align-middle text-[11.5px] font-semibold"
      style={{ color: couleur, opacity: montre ? 0.85 : 0, transition: 'opacity .25s ease', letterSpacing: 0 }}>
      {montre && (
        <>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round" className="animate-spin" style={{ animationDuration: '1.1s' }} aria-hidden>
            <path d="M21 12a9 9 0 1 1-2.64-6.36" /><polyline points="21 3 21 9 15 9" />
          </svg>
          Mise à jour
        </>
      )}
    </span>
  )
}
