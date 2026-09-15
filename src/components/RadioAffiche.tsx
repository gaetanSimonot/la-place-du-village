'use client'
import Link from 'next/link'
import Image from 'next/image'
import useSWR from 'swr'
import { sectionVisible } from '@/lib/visibilite'
import { imageEvenement } from '@/lib/imageEvenement'
import { RADIO, LOGO_ROND, BLEU_RADIO, formatDuree, type PayloadRadio } from '@/lib/radio'

/**
 * LE BLOC RADIO SUR LA PAGE VILLAGE.
 *
 * Une accroche, pas un lecteur : on annonce que la sélection de la semaine est
 * là et on montre ce qu'elle contient, puis on laisse la page du module faire
 * le reste. Mettre un lecteur ici ferait de la page Village un endroit où l'on
 * reste, alors que c'est un carrefour.
 *
 * Même titrage que les autres rubriques — `pcv-bh` sur ordinateur, `px-4` sur
 * téléphone. Le premier jet posait la carte contre les bords de l'écran : une
 * rubrique qui déborde de la gouttière commune se lit comme une erreur.
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

  /*
   * PAS D'ÉMISSION : un habitant ne voit rien, un admin voit la porte.
   *
   * Un bloc vide n'apprend rien au village. Mais pour toi, l'absence de bloc
   * est indiscernable d'un module cassé — c'est exactement ce qui s'est passé
   * la première fois. On montre donc le chemin vers la saisie, à toi seul.
   */
  if (!data.emission) {
    if (!isAdmin) return null
    return (
      <div className="px-4 pt-[18px]">
        <Link href="/radio/admin" className="block rounded-[16px] no-underline"
          style={{ border: '1px dashed var(--bord)', background: 'var(--blanc)', padding: 14 }}>
          <span className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_ROND} alt="" width={18} height={18}
              style={{ width: 18, height: 18, borderRadius: '50%', background: BLEU_RADIO }} />
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--accent)' }}>
              {RADIO.nom} · visible par toi seul
            </span>
          </span>
          <span className="mt-1 block font-title" style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--texte)' }}>
            Aucune émission en ligne
          </span>
          <span className="mt-0.5 block" style={{ fontSize: 12.5, color: 'var(--gris)' }}>
            Monter la sélection de la semaine →
          </span>
        </Link>
      </div>
    )
  }

  const { emission, mentions } = data
  const duree = formatDuree(emission.duree_s)
  const vignettes = mentions.filter(m => m.evenement).slice(0, 5)

  return (
    <>
      <div className="pcv-bh flex items-baseline justify-between gap-2.5 px-4 pb-2.5 pt-[18px]">
        <div>
          <h2 className="m-0 font-serif text-[20px] leading-[1.15] text-texte" style={{ letterSpacing: '-0.02em' }}>
            À la radio
          </h2>
          <div className="pcv-sub pcv-only">La sélection culturelle de la semaine</div>
        </div>
        <Link href="/radio" className="pcv-more flex shrink-0 items-center gap-1 text-[12.5px] font-bold no-underline"
          style={{ color: 'var(--accent)' }}>
          Écouter
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" /><polyline points="13 6 19 12 13 18" />
          </svg>
        </Link>
      </div>

      <div className="px-4">
        <Link href="/radio" className="block overflow-hidden rounded-[16px] no-underline"
          style={{ background: 'var(--blanc)', border: '1px solid var(--bord)', boxShadow: '0 2px 10px rgba(44,28,16,.06)' }}>
          <div className="flex items-center gap-3" style={{ padding: 13 }}>
            {/* Le logo de la radio, pas une icône générique : c'est lui qu'on
                reconnaît, et il dit d'où vient la sélection sans un mot. Le
                petit triangle en coin annonce le son sans voler la marque. */}
            <span aria-hidden className="relative h-11 w-11 flex-none">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={LOGO_ROND} alt="" width={44} height={44}
                style={{ width: 44, height: 44, borderRadius: '50%', display: 'block', background: BLEU_RADIO }} />
              <span className="absolute bottom-0 right-0 flex h-[17px] w-[17px] items-center justify-center rounded-full"
                style={{ background: 'var(--primary)', color: '#fff', border: '2px solid var(--blanc)' }}>
                <svg width="7" height="7" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5.5v13l11-6.5z" />
                </svg>
              </span>
            </span>

            <span className="min-w-0 flex-1">
              <span className="block" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--accent)' }}>
                {RADIO.nom}
              </span>
              <span className="mt-[3px] block truncate font-title" style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--texte)' }}>
                {emission.titre}
              </span>
              <span className="mt-[2px] block" style={{ fontSize: 12, color: 'var(--gris)' }}>
                {[
                  mentions.length ? `${mentions.length} rendez-vous cité${mentions.length > 1 ? 's' : ''}` : null,
                  duree,
                ].filter(Boolean).join(' · ') || 'La sélection de la semaine'}
              </span>
            </span>

            <svg aria-hidden width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#B3A794"
              strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="flex-none">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </div>

          {/* Les affiches de ce qui est cité : on reconnaît une image avant de
              lire un titre, et c'est ce qui donne envie d'ouvrir. */}
          {vignettes.length > 0 && (
            <div className="flex gap-1.5" style={{ padding: '0 13px 13px' }}>
              {vignettes.map(m => {
                const img = imageEvenement(m.evenement!)
                return (
                  <span key={m.id} className="relative block h-12 flex-1 overflow-hidden rounded-[9px]"
                    style={{ background: '#F0ECE6' }}>
                    {img && <Image src={img} alt="" fill sizes="70px" className="object-cover" />}
                  </span>
                )
              })}
            </div>
          )}
        </Link>
      </div>
    </>
  )
}
