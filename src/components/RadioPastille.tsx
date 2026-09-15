'use client'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { useAdminSession } from '@/hooks/useAdminSession'
import { sectionVisible } from '@/lib/visibilite'
import { RADIO, LOGO_ROND, BLEU_RADIO, type PayloadRadio } from '@/lib/radio'

/**
 * LE ROND DE LA RADIO, DANS LA BARRE DU HAUT.
 *
 * Une porte permanente vers le module, à l'endroit le plus vu de l'app. Pas
 * une rubrique de plus : le logo se reconnaît d'un coup d'œil là où un
 * libellé de plus encombrerait une barre déjà pleine.
 *
 * DEUX RÉGLAGES IMBRIQUÉS, PAS DEUX RÉGLAGES CÔTE À CÔTE.
 * `radio_village_public` gouverne TOUT le module — masqué, il masque aussi ce
 * rond, parce qu'un lien vers une section invisible ne veut rien dire. En
 * dessous, `radio_topbar_logo` dit si on pose le rond ou non : on peut très
 * bien ouvrir la page et le bloc du Village aux habitants sans toucher tout
 * de suite à la barre du haut.
 *
 * La clé SWR est la même que celle du bloc du Village : les deux composants
 * partagent une seule requête, il n'y en a pas une de plus pour ce rond.
 */

const fetcher = (u: string) => fetch(u).then(r => r.json())

export default function RadioPastille() {
  const router = useRouter()
  const isAdmin = useAdminSession()
  const { data } = useSWR<PayloadRadio>('/api/radio', fetcher, { revalidateOnFocus: false })

  if (!data) return null
  if (!data.topbarLogo) return null
  if (!sectionVisible(data.villageVisibilite, isAdmin)) return null

  return (
    <button
      onClick={() => router.push('/radio')}
      aria-label={`${RADIO.nom} — la sélection culturelle de la semaine`}
      title={RADIO.nom}
      style={{
        width: 38, height: 38, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
        // Le logo est un disque plein : un cercle de la couleur de marque
        // dessous evite le liseré blanc que laisserait un bord clair.
        border: 'none', background: BLEU_RADIO, padding: 0, overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={LOGO_ROND}
        alt=""
        width={38}
        height={38}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
    </button>
  )
}
