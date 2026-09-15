'use client'
import { createContext, useCallback, useContext, useRef, useState } from 'react'

/**
 * LA RADIO EN DIRECT, AU-DESSUS DES PAGES.
 *
 * Une fois lancée, l'antenne doit continuer partout dans l'app : on écoute en
 * regardant la carte, en lisant une annonce, en fouillant l'agenda. C'est la
 * raison d'être de ce fournisseur — il est monté dans le layout racine, donc
 * l'élément `<audio>` n'est jamais démonté par une navigation. Un lecteur posé
 * dans une page se tairait dès qu'on la quitte.
 *
 * UN SEUL ÉLÉMENT AUDIO POUR TOUTE L'APP. Le bouton de la barre du haut et le
 * bandeau du module pilotent le MÊME flux : deux éléments se superposeraient
 * en décalé, et l'un continuerait de jouer pendant qu'on croit avoir arrêté
 * l'autre.
 *
 * LE FLUX SÉCURISÉ, PAS LE FLUX EN CLAIR. `stream-ssl…:8443` est la seule
 * adresse utilisable : l'app est servie en HTTPS et un navigateur refuse tout
 * média en clair sur une page sécurisée — bloqué avant même la requête, sans
 * rien afficher qui l'explique. Vérifié en lecture réelle depuis la production
 * le 15/09/2026 : environ six secondes de mise en mémoire, puis le son.
 *
 * `preload="none"` : on n'ouvre pas une connexion permanente vers la radio
 * pour tous ceux qui passent sur l'app. On se branche au clic, pas avant.
 */

const FLUX = 'https://stream-ssl.radios-arra.fr:8443/radioescapades'

export type EtatRadio = 'arret' | 'connexion' | 'ecoute'

interface Contexte {
  etat: EtatRadio
  basculer: () => void
}

const RadioCtx = createContext<Contexte>({ etat: 'arret', basculer: () => {} })

/** Piloter le direct depuis n'importe où dans l'app. */
export function useRadioDirect(): Contexte {
  return useContext(RadioCtx)
}

export default function RadioDirectProvider({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLAudioElement | null>(null)
  const [etat, setEtat] = useState<EtatRadio>('arret')

  const basculer = useCallback(() => {
    const a = ref.current
    if (!a) return

    setEtat(actuel => {
      if (actuel !== 'arret') {
        a.pause()
        /*
         * On VIDE la source au lieu de seulement mettre en pause.
         *
         * Un direct en pause continue de télécharger : reprendre plus tard
         * rejouerait la minute écoulée pendant l'arrêt, ce qui n'est plus du
         * direct. Repartir de zéro rebranche sur l'antenne telle qu'elle est.
         */
        a.removeAttribute('src')
        a.load()
        return 'arret'
      }

      a.src = FLUX
      void a.play().catch(() => setEtat('arret'))
      return 'connexion'
    })
  }, [])

  return (
    <RadioCtx.Provider value={{ etat, basculer }}>
      {children}
      <audio
        ref={ref}
        preload="none"
        onPlaying={() => setEtat('ecoute')}
        onWaiting={() => setEtat(e => (e === 'arret' ? e : 'connexion'))}
        onPause={() => setEtat('arret')}
        /*
         * Vider la source fait remonter une erreur « src vide » : c'est notre
         * propre arrêt, pas une panne. On ne repasse donc à l'arrêt que si une
         * source était réellement en cours de lecture.
         */
        onError={() => { if (ref.current?.getAttribute('src')) setEtat('arret') }}
        style={{ display: 'none' }}
      />
    </RadioCtx.Provider>
  )
}
