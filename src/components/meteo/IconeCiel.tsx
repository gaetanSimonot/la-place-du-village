import type { Ciel } from '@/lib/meteo/lecture'

/** Icônes au trait, même épaisseur que la barre du bas. Pas d'emoji. */
export default function IconeCiel({ ciel, taille = 28, couleur = 'currentColor' }: { ciel: Ciel; taille?: number; couleur?: string }) {
  const nuage = <path d="M17.5 19H9a6 6 0 1 1 5.7-7.9A4.5 4.5 0 1 1 17.5 19z" />
  const soleilPetit = <><path d="M8 2.5v1.5" /><path d="M3.8 4.3l1 1" /><path d="M2 8.5h1.5" /><path d="M12.2 4.3l-1 1" /><path d="M10.6 9.2A3 3 0 0 0 5.4 6.6" /></>
  const traits: Record<Ciel, React.ReactNode> = {
    soleil: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
    lune: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
    eclaircies: <>{soleilPetit}<path d="M18 20h-7.5a4.5 4.5 0 1 1 4.3-5.9A3.4 3.4 0 1 1 18 20z" /></>,
    'eclaircies-nuit': <><path d="M11 6.5A4.5 4.5 0 0 1 5 11a4.5 4.5 0 0 0 6-4.5z" /><path d="M18 20h-7.5a4.5 4.5 0 1 1 4.3-5.9A3.4 3.4 0 1 1 18 20z" /></>,
    nuages: <><path d="M8 7.5a5 5 0 0 1 9.3 1.2A3.5 3.5 0 0 1 20 12.5" />{nuage}</>,
    couvert: nuage,
    pluie: <><path d="M17.5 15H9a5 5 0 1 1 4.8-6.4A3.8 3.8 0 1 1 17.5 15z" /><path d="M9 18l-1 2.5M13 18l-1 2.5M17 18l-1 2.5" /></>,
    forte: <><path d="M17.5 14H9a5 5 0 1 1 4.8-6.4A3.8 3.8 0 1 1 17.5 14z" /><path d="M8 17l-1.5 4M12 17l-1.5 4M16 17l-1.5 4" /></>,
    orage: <><path d="M17.5 14H9a5 5 0 1 1 4.8-6.4A3.8 3.8 0 1 1 17.5 14z" /><path d="M12.5 15.5l-2 3.5h3l-2 3.5" /></>,
  }
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke={couleur} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {traits[ciel]}
    </svg>
  )
}
