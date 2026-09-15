'use client'
import { RADIO } from '@/lib/radio'
import { useRadioDirect } from '@/components/RadioDirectProvider'

/**
 * LE BANDEAU DU DIRECT, EN HAUT DU MODULE.
 *
 * Il ne tient PAS le son : il commande le lecteur du layout, le même que le
 * bouton de la barre du haut. Deux éléments audio se superposeraient en
 * décalé, et l'un continuerait de jouer pendant qu'on croit avoir arrêté
 * l'autre.
 *
 * ON ANNONCE LA CONNEXION. Un flux met cinq à huit secondes à se remplir avant
 * le premier son — mesuré. Sans état affiché, on tape deux fois en croyant que
 * le bouton est cassé, et la deuxième pression coupe ce que la première avait
 * lancé.
 */

export default function RadioDirect() {
  const { etat, basculer } = useRadioDirect()
  const enMarche = etat !== 'arret'

  return (
    <div className="px-4 pt-4">
      <button
        type="button"
        onClick={basculer}
        aria-pressed={enMarche}
        className="flex w-full items-center gap-3 rounded-[16px] text-left"
        style={{
          background: enMarche ? 'var(--primary)' : 'var(--blanc)',
          border: `1px solid ${enMarche ? 'var(--primary)' : 'var(--bord)'}`,
          padding: 12, cursor: 'pointer', transition: 'background .2s',
        }}
      >
        <span aria-hidden style={{
          width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: enMarche ? 'rgba(255,255,255,.18)' : 'var(--primary)',
          color: '#fff',
        }}>
          {etat === 'connexion' ? (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.6" strokeLinecap="round"
              style={{ animation: 'pcvRadioTourne 900ms linear infinite' }}>
              <path d="M12 3a9 9 0 1 0 9 9" />
            </svg>
          ) : enMarche ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5.5v13l11-6.5z" />
            </svg>
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
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
          </span>
          <span className="block truncate font-title" style={{
            fontSize: 14.5, fontWeight: 700, marginTop: 2,
            color: enMarche ? '#fff' : 'var(--texte)',
          }}>
            {RADIO.nom}
          </span>
          <span className="block" style={{ fontSize: 12, marginTop: 1, color: enMarche ? 'rgba(255,255,255,.72)' : 'var(--gris)' }}>
            {etat === 'connexion' ? 'Connexion à l’antenne…'
              : etat === 'ecoute' ? 'Vous écoutez l’antenne — même en changeant de page'
              : 'Écouter l’antenne maintenant'}
          </span>
        </span>

        {enMarche && etat === 'ecoute' && (
          <span aria-hidden className="pcv-eq flex-none" style={{ color: 'rgba(255,255,255,.9)' }}>
            <i /><i /><i />
          </span>
        )}
      </button>
    </div>
  )
}
