/**
 * Le soleil du logo — signe de TOUTES les fonctions qui comprennent le
 * langage naturel : la barre du Village, l'en-tête de la conversation, les
 * réponses de l'assistant, et demain l'ajout d'un événement par dictée ou
 * par photo.
 *
 * Jamais un robot, jamais une étincelle, jamais un emoji : le handoff design
 * est explicite, et un signe unique vaut mieux qu'un vocabulaire d'icônes.
 * Le tracé vient de la maquette (`.askIco`).
 */
export default function Soleil({ size = 18, rayons = 8 }: { size?: number; rayons?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" style={{ display: 'block' }}>
      <circle cx="17" cy="17" r={rayons === 8 ? 5.5 : 6} fill="currentColor" stroke="none" />
      <path d="M17 3.5v3.6M17 26.9v3.6M3.5 17h3.6M26.9 17h3.6" />
      {/* En petit, les diagonales se referment en tache : on les retire. */}
      {rayons === 8 && <path d="M7.6 7.6l2.5 2.5M23.9 23.9l2.5 2.5M26.4 7.6l-2.5 2.5M10.1 23.9l-2.5 2.5" />}
    </svg>
  )
}
