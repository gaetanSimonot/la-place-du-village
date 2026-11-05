/**
 * Le champignon de « Dans nos bois », en trait — même famille que les icônes
 * de la bottom nav (lineart, bouts arrondis). Redessiné d'après le pictogramme
 * fourni : un chapeau en dôme posé sur un pied légèrement évasé.
 */
export default function IconeChampignon({ taille = 22, couleur = '#2E5A3A', epaisseur = 1.9 }: {
  taille?: number; couleur?: string; epaisseur?: number
}) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke={couleur}
      strokeWidth={epaisseur} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.2 12.6C3.2 7.9 7.2 4.3 12 4.3s8.8 3.6 8.8 8.3c0 .7-.5 1.2-1.2 1.2H4.4c-.7 0-1.2-.5-1.2-1.2z" />
      <path d="M9.4 13.8c-.4 2.3-.5 4.3-.1 5.8.3 1 5.1 1 5.4 0 .4-1.5.3-3.5-.1-5.8" />
    </svg>
  )
}
