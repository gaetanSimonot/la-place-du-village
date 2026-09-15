'use client'
import { useEffect, useRef, useState } from 'react'
import { RADIO } from '@/lib/radio'

/**
 * ÉCOUTER LA RADIO EN DIRECT, EN HAUT DU MODULE.
 *
 * Le direct passe avant la sélection de la semaine : c'est ce qu'on peut faire
 * MAINTENANT, et ça ne demande qu'un geste.
 *
 * LE FLUX SÉCURISÉ, PAS LE FLUX EN CLAIR. `stream-ssl…:8443` est la seule
 * adresse utilisable : l'app est servie en HTTPS et un navigateur refuse tout
 * média en clair sur une page sécurisée — bloqué avant la requête, sans rien
 * afficher qui l'explique. Vérifié le 15/09/2026 en lecture réelle depuis le
 * domaine de production.
 *
 * ON ANNONCE LA CONNEXION. Un flux met cinq à huit secondes à se remplir avant
 * le premier son — mesuré. Sans état affiché, on tape deux fois sur le bouton
 * en croyant qu'il est cassé, et la deuxième pression coupe ce que la première
 * avait lancé.
 *
 * `preload="none"` : la page ne doit pas ouvrir une connexion permanente vers
 * la radio pour tous ceux qui passent. On se connecte au clic, pas avant.
 */

/** Le flux en direct. HTTPS obligatoire, cf. plus haut. */
const FLUX = 'https://stream-ssl.radios-arra.fr:8443/radioescapades'

type Etat = 'arret' | 'connexion' | 'ecoute'

export default function RadioDirect() {
  const ref = useRef<HTMLAudioElement | null>(null)
  const [etat, setEtat] = useState<Etat>('arret')

  // Quitter la page ne doit pas laisser la radio jouer dans le vide.
  useEffect(() => () => { ref.current?.pause() }, [])

  async function basculer() {
    const a = ref.current
    if (!a) return

    if (etat !== 'arret') {
      a.pause()
      /*
       * On VIDE la source au lieu de seulement mettre en pause.
       *
       * Un direct en pause continue de télécharger : reprendre plus tard
       * rejouerait la minute écoulée pendant la pause, ce qui n'est plus du
       * direct. Repartir de zéro rebranche sur l'antenne telle qu'elle est.
       */
      a.removeAttribute('src')
      a.load()
      setEtat('arret')
      return
    }

    setEtat('connexion')
    a.src = FLUX
    try {
      await a.play()
    } catch {
      // Refus du navigateur, ou flux injoignable : on redevient silencieux
      // plutôt que de laisser un bouton qui prétend écouter.
      setEtat('arret')
    }
  }

  const enMarche = etat !== 'arret'

  return (
    <div className="px-4 pt-4">
      <div className="flex items-center gap-3 rounded-[16px]"
        style={{
          background: enMarche ? 'var(--primary)' : 'var(--blanc)',
          border: `1px solid ${enMarche ? 'var(--primary)' : 'var(--bord)'}`,
          padding: 12,
          transition: 'background .2s',
        }}>
        <button
          type="button"
          onClick={basculer}
          aria-label={enMarche ? 'Arrêter le direct' : `Écouter ${RADIO.nom} en direct`}
          style={{
            width: 42, height: 42, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
            border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: enMarche ? 'rgba(255,255,255,.18)' : 'var(--primary)',
            color: '#fff',
          }}
        >
          {etat === 'connexion' ? (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.6" strokeLinecap="round" aria-hidden
              style={{ animation: 'pcvRadioTourne 900ms linear infinite' }}>
              <path d="M12 3a9 9 0 1 0 9 9" />
            </svg>
          ) : enMarche ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M8 5.5v13l11-6.5z" />
            </svg>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span aria-hidden style={{
              width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
              background: enMarche ? '#7FD6A0' : 'var(--accent)',
              animation: etat === 'ecoute' ? 'pcvRadioPouls 1.6s ease-in-out infinite' : 'none',
            }} />
            <span style={{
              fontSize: 10.5, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase',
              color: enMarche ? 'rgba(255,255,255,.85)' : 'var(--accent)',
            }}>
              En direct
            </span>
          </div>
          <div className="truncate font-title" style={{
            fontSize: 14.5, fontWeight: 700, marginTop: 2,
            color: enMarche ? '#fff' : 'var(--texte)',
          }}>
            {RADIO.nom}
          </div>
          <div style={{ fontSize: 12, marginTop: 1, color: enMarche ? 'rgba(255,255,255,.72)' : 'var(--gris)' }}>
            {etat === 'connexion' ? 'Connexion à l’antenne…'
              : etat === 'ecoute' ? 'Vous écoutez l’antenne'
              : 'Écouter l’antenne maintenant'}
          </div>
        </div>
      </div>

      <audio
        ref={ref}
        preload="none"
        onPlaying={() => setEtat('ecoute')}
        onWaiting={() => setEtat(e => (e === 'arret' ? e : 'connexion'))}
        onPause={() => setEtat('arret')}
        onError={() => setEtat('arret')}
        style={{ display: 'none' }}
      />

      <style>{`
        @keyframes pcvRadioTourne { to { transform: rotate(360deg) } }
        @keyframes pcvRadioPouls { 0%,100% { opacity: 1 } 50% { opacity: .25 } }
        @media (prefers-reduced-motion: reduce) {
          [style*="pcvRadioTourne"], [style*="pcvRadioPouls"] { animation: none !important }
        }
      `}</style>
    </div>
  )
}
