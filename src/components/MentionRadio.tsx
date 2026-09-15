'use client'
import useSWR from 'swr'
import { supabase } from '@/lib/supabase'
import { useAdminSession } from '@/hooks/useAdminSession'
import { parseVisibilite, sectionVisible } from '@/lib/visibilite'
import { MENTION_RADIO, LOGO_ROND, BLEU_RADIO } from '@/lib/radio'

/**
 * « SÉLECTION RADIO ESCAPADES » — la mention qui suit l'événement partout.
 *
 * Un rendez-vous cité à l'antenne garde sa mention où qu'on le croise : dans
 * la liste, sur la fiche, ailleurs. C'est tout l'intérêt — sinon la sélection
 * n'existerait que sur la page du module, là où elle n'apprend rien à
 * personne.
 *
 * ELLE PORTE LE BLEU DE LA RADIO, pas l'orange de l'app. C'est une marque
 * extérieure qui recommande un événement : la faire passer pour un label
 * maison serait trompeur, et le contraste est justement ce qui la fait
 * remarquer au milieu des pastilles de catégorie.
 *
 * Elle est COMPOSÉE — le rond, puis le texte — faute de logotype horizontal.
 * Assembler à partir de la vraie marque vaut mieux que dessiner un logo qui
 * n'existe pas.
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
  const rond = petite ? 14 : 18

  return (
    <span
      className="inline-flex items-center rounded-full align-middle"
      style={{
        gap: petite ? 5 : 6,
        border: `1px solid ${BLEU_RADIO}2E`,
        background: `${BLEU_RADIO}0F`,
        color: BLEU_RADIO,
        padding: petite ? '2px 8px 2px 3px' : '3px 11px 3px 4px',
        fontSize: petite ? 10 : 11.5,
        fontWeight: 700,
        letterSpacing: .1,
        whiteSpace: 'nowrap',
        maxWidth: '100%',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={LOGO_ROND}
        alt=""
        width={rond}
        height={rond}
        style={{ width: rond, height: rond, borderRadius: '50%', display: 'block', flexShrink: 0 }}
      />
      <span className="truncate">{MENTION_RADIO}</span>
    </span>
  )
}
