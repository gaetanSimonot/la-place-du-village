'use client'
import useSWR from 'swr'
import { useAdminSession } from '@/hooks/useAdminSession'
import { sectionVisible } from '@/lib/visibilite'
import { RADIO, LOGO_ROND, BLEU_RADIO, type PayloadRadio } from '@/lib/radio'
import { useRadioDirect } from '@/components/RadioDirectProvider'

/**
 * LE BOUTON DE LA RADIO, DANS LA BARRE DU HAUT.
 *
 * Le logo EST la commande : un appui lance l'antenne, un autre l'arrête. Pas
 * un raccourci vers une page où il faudrait chercher un second bouton — la
 * radio s'écoute, elle ne se consulte pas.
 *
 * PERMANENT tant que le module est visible. Il n'y a rien à régler : un
 * bouton qui apparaît et disparaît selon une case à cocher est une chose de
 * plus à se rappeler, pour un gain nul. Seul `radio_village_public` décide —
 * masqué, ce bouton l'est aussi.
 *
 * ON DOIT VOIR QUE ÇA JOUE. Un logo immobile ne dit pas s'il reste du son
 * quelque part dans l'app — et comme l'antenne continue d'une page à l'autre,
 * on finirait par laisser la radio tourner sans le savoir. D'où l'égaliseur :
 * trois barres qui bougent, lisibles à 38 px.
 *
 * Le son lui-même est tenu par `RadioDirectProvider`, monté dans le layout :
 * ce bouton ne fait que le commander.
 */

const fetcher = (u: string) => fetch(u).then(r => r.json())

export default function RadioPastille() {
  const isAdmin = useAdminSession()
  const { data } = useSWR<PayloadRadio>('/api/radio', fetcher, { revalidateOnFocus: false })
  const { etat, basculer } = useRadioDirect()

  if (!data) return null
  if (!sectionVisible(data.villageVisibilite, isAdmin)) return null

  const enMarche = etat !== 'arret'

  return (
    <button
      type="button"
      onClick={basculer}
      aria-label={enMarche ? `Arrêter ${RADIO.nom}` : `Écouter ${RADIO.nom} en direct`}
      aria-pressed={enMarche}
      title={enMarche ? `Arrêter ${RADIO.nom}` : `Écouter ${RADIO.nom} en direct`}
      style={{
        position: 'relative', width: 38, height: 38, borderRadius: '50%',
        flexShrink: 0, cursor: 'pointer', padding: 0, overflow: 'hidden',
        // Le logo est un disque plein : la même couleur dessous évite le
        // liseré clair qu'un bord blanc laisserait sur les angles.
        border: 'none', background: BLEU_RADIO,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={LOGO_ROND}
        alt=""
        width={38}
        height={38}
        style={{
          width: '100%', height: '100%', objectFit: 'cover', display: 'block',
          // En marche, le logo s'efface derrière l'état : c'est l'égaliseur
          // qui porte l'information, et il doit se lire sans effort.
          opacity: enMarche ? .22 : 1,
          transition: 'opacity .2s',
        }}
      />

      {enMarche && (
        <span aria-hidden style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center', color: '#fff',
        }}>
          {etat === 'connexion' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.6" strokeLinecap="round"
              style={{ animation: 'pcvRadioTourne 900ms linear infinite' }}>
              <path d="M12 3a9 9 0 1 0 9 9" />
            </svg>
          ) : (
            <span className="pcv-eq"><i /><i /><i /></span>
          )}
        </span>
      )}
    </button>
  )
}
