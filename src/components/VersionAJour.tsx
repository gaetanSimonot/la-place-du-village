'use client'
import { useEffect } from 'react'
import { signalerMiseAJour } from '@/lib/miseAJour'

/**
 * L'APPLI NE RESTE PAS SUR UNE VIEILLE COPIE.
 *
 * À l'ouverture, le service worker n'attend la page fraîche que 3 s
 * (next.config.mjs, networkTimeoutSeconds) ; au-delà — réseau lent, appli
 * réveillée à froid — il sert la copie gardée, parfois d'avant le dernier
 * déploiement. Le 06/11 : « Dans nos bois » absent une fois sur deux, revenu
 * en relançant l'appli.
 *
 * On compare donc, APRÈS l'affichage, la version du code chargé à celle en
 * ligne (/api/version). Différente : on recharge une fois, ce que Gaëtan
 * faisait à la main. Rien n'attend cette vérification au démarrage.
 *
 * On ne recharge que quand ça ne coûte rien : juste après l'ouverture, ou au
 * retour dans l'appli après une vraie absence — jamais pendant une saisie.
 * Une seule tentative par version et par session : si le réseau resservait
 * encore la vieille copie, pas de boucle.
 */
const ICI = process.env.NEXT_PUBLIC_VERSION
const CLE_TENTATIVE = 'pdv-maj-tentee'
/** Fenêtre après l'ouverture où recharger ne dérange pas encore. */
const JUSTE_OUVERTE_MS = 15_000
/** Absence minimale avant de recharger au retour dans l'appli. */
const ABSENCE_MIN_MS = 30_000

function enSaisie(): boolean {
  const el = document.activeElement as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

export default function VersionAJour() {
  useEffect(() => {
    if (!ICI || ICI === 'dev') return
    const ouverteA = Date.now()
    let cacheeA = 0

    async function verifier(auRetour: boolean) {
      let enLigne: string | undefined
      // « Mise à jour » tourne aussi le temps de cette vérification.
      signalerMiseAJour('version', true)
      try {
        const r = await fetch('/api/version', { cache: 'no-store' })
        enLigne = (await r.json())?.version
      } catch { return } finally { signalerMiseAJour('version', false) }
      if (!enLigne || enLigne === 'dev' || enLigne === ICI) return
      if (!auRetour && Date.now() - ouverteA > JUSTE_OUVERTE_MS) return
      if (enSaisie()) return
      try {
        if (sessionStorage.getItem(CLE_TENTATIVE) === enLigne) return
        sessionStorage.setItem(CLE_TENTATIVE, enLigne)
      } catch { return }
      window.location.reload()
    }

    const t = setTimeout(() => verifier(false), 1500)
    const surVisibilite = () => {
      if (document.visibilityState === 'hidden') { cacheeA = Date.now(); return }
      if (cacheeA && Date.now() - cacheeA >= ABSENCE_MIN_MS) verifier(true)
    }
    document.addEventListener('visibilitychange', surVisibilite)
    return () => { clearTimeout(t); document.removeEventListener('visibilitychange', surVisibilite) }
  }, [])
  return null
}
