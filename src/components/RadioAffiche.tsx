'use client'
import Link from 'next/link'
import useSWR from 'swr'
import { sectionVisible } from '@/lib/visibilite'
import { RADIO, formatDuree, type PayloadRadio } from '@/lib/radio'

/**
 * LE BLOC RADIO SUR LA PAGE VILLAGE.
 *
 * Une accroche, pas un lecteur : on annonce que la sélection de la semaine est
 * là et combien de rendez-vous elle contient, et on laisse la page du module
 * faire le reste. Mettre un lecteur ici ferait de la page Village un endroit
 * où l'on reste, alors que c'est un carrefour.
 *
 * C'est CE bloc que `radio_village_public` ouvre et ferme — jamais l'adresse
 * /radio, qui reste accessible. Une entrée qui apparaît et disparaît selon un
 * réglage est pire que le mal.
 */

const fetcher = (u: string) => fetch(u).then(r => r.json())

export default function RadioAffiche({ isAdmin }: { isAdmin: boolean }) {
  const { data } = useSWR<PayloadRadio>('/api/radio', fetcher)

  if (!data) return null
  if (!sectionVisible(data.villageVisibilite, isAdmin)) return null
  if (!data.emission) return null

  const { emission, mentions } = data
  const duree = formatDuree(emission.duree_s)

  return (
    <Link
      href="/radio"
      className="mt-4 block overflow-hidden rounded-[18px] no-underline"
      style={{ background: '#17120E', color: '#F6EFE6' }}
    >
      <div className="flex items-center gap-3" style={{ padding: 14 }}>
        {/* Le bouton de lecture ne LIT rien ici : il dit « il y a du son
            derrière ». Le vrai lecteur est sur la page du module. */}
        <span
          aria-hidden
          className="flex h-11 w-11 flex-none items-center justify-center rounded-full"
          style={{ background: '#E8913C', color: '#17120E' }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5.5v13l11-6.5z" />
          </svg>
        </span>

        <span className="min-w-0 flex-1">
          <span style={{ display: 'block', fontSize: 10.5, fontWeight: 700, letterSpacing: 1.3, textTransform: 'uppercase', color: '#E8913C' }}>
            {RADIO.nom}
          </span>
          <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, lineHeight: 1.3, marginTop: 2 }}>
            {emission.titre}
          </span>
          <span style={{ display: 'block', fontSize: 12, color: '#A5917C', marginTop: 2 }}>
            {[
              mentions.length
                ? `${mentions.length} rendez-vous cité${mentions.length > 1 ? 's' : ''}`
                : null,
              duree,
            ].filter(Boolean).join(' · ') || 'La sélection de la semaine'}
          </span>
        </span>

        <svg aria-hidden width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#A5917C"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-none">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    </Link>
  )
}
