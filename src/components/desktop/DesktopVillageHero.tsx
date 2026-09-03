'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

/**
 * HÉROS DE L'ACCUEIL — version ordinateur (handoff §4).
 *
 * Photo panoramique qui déborde jusqu'au bord gauche de l'écran et s'arrête
 * au début de la colonne de droite, voile en dégradé crème pour garder le
 * texte lisible, puis les quatre portes d'entrée du village.
 *
 * Masqué en dessous de 1024 px par `.pcv-only` : le mobile garde son titre
 * et ses quatre tuiles, inchangés.
 *
 * Les compteurs viennent de /api/village/counts — de vrais comptages, pas
 * des nombres d'illustration. Tant qu'ils ne sont pas arrivés, la ligne de
 * compteur reste vide plutôt que d'afficher un chiffre faux.
 */

interface Compteurs {
  evenementsJour?: number
  promosActives?: number
  etablissements?: number
  journal?: number
}

/** Image du héros : le fond du splash, seul panoramique du village qu'on ait. */
const PHOTO_HERO = '/splash-bg-aujourdhui.jpg'

const Fleche = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="13 6 19 12 13 18" />
  </svg>
)

export default function DesktopVillageHero() {
  const [c, setC] = useState<Compteurs>({})

  useEffect(() => {
    let vivant = true
    fetch('/api/village/counts')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (vivant && d) setC(d as Compteurs) })
      .catch(() => { /* les portes se passent de compteur */ })
    return () => { vivant = false }
  }, [])

  const n = (v: number | undefined, un: string, pluriel: string) =>
    typeof v === 'number' ? `${v} ${v > 1 ? pluriel : un}` : ''

  /**
   * Les portes qui mènent à la coquille d'accueil (carte, annuaire) sont des
   * navigations douces : la coquille reste montée et ne relit pas l'URL. Sans
   * ce relais, cliquer « Événements » changeait l'adresse sans changer
   * l'écran. Même mécanisme que l'en-tête du site.
   */
  const changerVue = (v?: string) => {
    if (v) window.dispatchEvent(new CustomEvent('pdv-vue', { detail: v }))
  }

  const PORTES: { href: string; vue?: string; titre: string; phrase: string; compte: string; icone: React.ReactNode }[] = [
    {
      href: '/?mode=agenda',
      vue: 'carte',
      titre: 'Événements',
      phrase: 'Concerts, marchés, brocantes, fêtes votives : l’agenda de la vallée au jour le jour.',
      compte: typeof c.evenementsJour === 'number' ? `${c.evenementsJour} aujourd’hui` : '',
      icone: <><rect x="3" y="5" width="18" height="16" rx="2.5" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="8" y1="3" x2="8" y2="6.5" /><line x1="16" y1="3" x2="16" y2="6.5" /></>,
    },
    {
      href: '/promotions',
      titre: 'Bons plans',
      phrase: 'Les promotions en cours chez les commerçants, valables tout de suite.',
      compte: typeof c.promosActives === 'number' ? `${c.promosActives} en cours` : '',
      // Le cadeau, comme dans l'onglet Bons plans de l'app mobile
      // (BottomNavBar, icône `gift`) : même repère visuel des deux côtés.
      icone: <><polyline points="20 12 20 22 4 22 4 12" /><rect x="2" y="7" width="20" height="5" /><line x1="12" y1="22" x2="12" y2="7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" /></>,
    },
    {
      href: '/?mode=annuaire',
      vue: 'annuaire',
      titre: 'Commerces',
      phrase: 'Boutiques, restaurants, artisans et producteurs, avec horaires et contact.',
      compte: n(c.etablissements, 'fiche', 'fiches'),
      icone: <><path d="M3 9h18l-1.5-4.5A1.5 1.5 0 0 0 18 3.5H6a1.5 1.5 0 0 0-1.5 1L3 9z" /><path d="M4.5 9v10.5A1.5 1.5 0 0 0 6 21h12a1.5 1.5 0 0 0 1.5-1.5V9" /><path d="M9 21v-6h6v6" /></>,
    },
    {
      href: '/journal',
      titre: 'Le journal',
      phrase: 'Le récit des semaines écoulées dans le village, publié en numéros.',
      compte: typeof c.journal === 'number' && c.journal > 0 ? `Numéro ${c.journal}` : '',
      icone: <><rect x="2" y="4" width="20" height="16" rx="2" /><line x1="6" y1="9" x2="18" y2="9" /><line x1="6" y1="13" x2="18" y2="13" /><line x1="6" y1="17" x2="13" y2="17" /></>,
    },
  ]

  return (
    <section className="pcv-only pcv-heroB">
      <div className="pcv-heroPh">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={PHOTO_HERO} alt="" />
      </div>

      <div className="pcv-heroIn">
        <div className="pcv-heroT">
          <span className="pcv-sur">Bonjour voisin</span>
          <h1>Tout ce qui se passe à Ganges et dans la vallée</h1>
          <p>
            Les événements, les promotions des commerces, les producteurs du coin
            et le journal du village. Rassemblés à un seul endroit, tenus à jour
            par les habitants.
          </p>
        </div>

        <div className="pcv-portes">
          {PORTES.map(p => (
            <Link key={p.titre} href={p.href} className="pcv-porte" onClick={() => changerVue(p.vue)}>
              <span className="pcv-porteIc">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  {p.icone}
                </svg>
              </span>
              <h3>{p.titre}</h3>
              <p>{p.phrase}</p>
              <span className="pcv-porteN">{p.compte}{p.compte && <Fleche />}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
