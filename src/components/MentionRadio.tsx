'use client'
import useSWR from 'swr'
import { supabase } from '@/lib/supabase'
import { useAdminSession } from '@/hooks/useAdminSession'
import { parseVisibilite, sectionVisible } from '@/lib/visibilite'
import { MENTION_RADIO } from '@/lib/radio'

/**
 * « SÉLECTION RADIO ESCAPADES » — la mention qui suit l'événement partout.
 *
 * Un rendez-vous cité à l'antenne garde sa mention où qu'on le croise : dans
 * la liste, sur la fiche, ailleurs. C'est tout l'intérêt — sinon la sélection
 * n'existerait que sur la page du module, là où elle n'apprend rien à
 * personne.
 *
 * ELLE DISPARAÎT AVEC LE MODULE. Tant que `radio_village_public` est sur
 * « masqué » ou « admins », aucun habitant ne doit la voir : un badge qui
 * renvoie à un module invisible ne veut rien dire. La règle est lue ici, une
 * seule fois — SWR partage la clé entre tous les exemplaires montés, donc
 * trente cartes de la liste ne font qu'une requête.
 *
 * Le drapeau `radio_selection` vient d'un déclencheur SQL, jamais d'une
 * écriture applicative : il ne peut pas rester allumé sur un événement qui
 * n'est plus cité.
 */

const lireVisibilite = async () => {
  const { data } = await supabase
    .from('config').select('value').eq('key', 'radio_village_public').maybeSingle()
  return parseVisibilite(data?.value)
}

/** La mention est-elle montrable à CE lecteur ? */
export function useMentionRadioVisible(): boolean {
  const isAdmin = useAdminSession()
  const { data } = useSWR('radio-visibilite', lireVisibilite, {
    revalidateOnFocus: false,
    // Le réglage change une fois par trimestre : le relire à chaque montage
    // de carte n'apporterait rien.
    dedupingInterval: 5 * 60 * 1000,
  })
  if (!data) return false
  return sectionVisible(data, isAdmin)
}

export default function MentionRadio({
  actif,
  taille = 'normale',
}: {
  /** `evenement.radio_selection` — passé tel quel, le composant tranche. */
  actif: boolean | null | undefined
  taille?: 'normale' | 'petite'
}) {
  const visible = useMentionRadioVisible()
  if (!actif || !visible) return null

  const petite = taille === 'petite'
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full align-middle"
      style={{
        border: '1px solid rgba(232,145,60,.45)',
        background: 'rgba(232,145,60,.12)',
        color: '#B4661F',
        padding: petite ? '2px 7px' : '3px 9px',
        fontSize: petite ? 10 : 11,
        fontWeight: 700,
        letterSpacing: .2,
        whiteSpace: 'nowrap',
      }}
    >
      {/* Trois ondes : le signe d'une diffusion, lisible à 10 px là où une
          icône de micro deviendrait une tache. */}
      <svg aria-hidden width={petite ? 9 : 11} height={petite ? 9 : 11} viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <path d="M12 12h.01" />
        <path d="M8.5 15.5a5 5 0 0 1 0-7" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      </svg>
      {MENTION_RADIO}
    </span>
  )
}
