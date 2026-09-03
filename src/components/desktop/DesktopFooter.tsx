'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * PIED DE PAGE BUREAU.
 *
 * N'existe pas sur mobile : `.pcv-only` le masque en dessous de 1024 px.
 *
 * Absent de l'écran Carte, qui occupe toute la hauteur disponible — un pied
 * de page sous une carte plein écran ne se verrait jamais et créerait un
 * défilement parasite (handoff §7).
 *
 * Aucun lien n'est inventé : toutes les adresses existent déjà dans l'app.
 */

const DECOUVRIR = [
  { label: 'La carte',        href: '/?mode=agenda' },
  { label: 'L’agenda',        href: '/?mode=agenda&liste=1' },
  { label: 'Les commerces',   href: '/?mode=annuaire' },
  { label: 'Les producteurs', href: '/?mode=annuaire&ann=producteurs' },
  { label: 'Les bons plans',  href: '/promotions' },
  { label: 'Le journal',      href: '/journal' },
]

const PARTICIPER = [
  { label: 'Publier un événement', href: '/ajouter' },
  { label: 'Déposer une annonce',  href: '/annonces/nouvelle' },
  { label: 'Le forum du village',  href: '/forum' },
  { label: 'Proposer un trajet',   href: '/covoiturage' },
  { label: 'Écrire au Journal',    href: '/journal/articles/nouveau' },
  { label: 'La newsletter',        href: '/newsletter' },
]

const LA_PLACE = [
  { label: 'Nous écrire',              href: '/support' },
  { label: 'Devenir Partenaire Local', href: '/abonnements' },
  { label: 'Mentions légales',         href: '/mentions-legales' },
  { label: 'Confidentialité',          href: '/politique-confidentialite' },
  { label: 'Conditions d’utilisation', href: '/cgu' },
]

function Colonne({ titre, liens }: { titre: string; liens: { label: string; href: string }[] }) {
  return (
    <div className="pcv-ftCol">
      <h4>{titre}</h4>
      {liens.map(l => <Link key={l.href + l.label} href={l.href}>{l.label}</Link>)}
    </div>
  )
}

export default function DesktopFooter() {
  const pathname = usePathname() ?? '/'

  // La carte prend toute la hauteur : pas de pied de page dessous.
  if (pathname === '/') return null

  return (
    <footer className="pcv-only pcv-ft">
      <div className="pcv-ftIn">
        <div className="pcv-ftMark">
          La Place du Village
          <p>
            Ce qui se passe autour de Ganges : les événements, les commerces,
            les producteurs, les bons plans et les annonces des habitants.
            Fait ici, pour ici.
          </p>
        </div>
        <Colonne titre="Découvrir"  liens={DECOUVRIR} />
        <Colonne titre="Participer" liens={PARTICIPER} />
        <Colonne titre="La place"   liens={LA_PLACE} />
      </div>

      <div className="pcv-ftLegal">
        <span>© {new Date().getFullYear()} La Place du Village</span>
        <span>Ganges et ses alentours · Hérault</span>
      </div>
    </footer>
  )
}
