'use client'
import type { CSSProperties } from 'react'

/**
 * FLOU DE BORD — la « mise au point macro » du Village.
 *
 * Deux bandes posées sur la zone qui défile, en haut et en bas, qui floutent
 * ce qui passe dessous (`backdrop-filter`) sans rien intercepter du doigt.
 *
 * Un VRAI dégradé de flou et non un flou uniforme qui s'estompe : trois
 * couches empilées, de plus en plus floues, chacune masquée sur une tranche
 * de plus en plus proche du bord. Le flou croît donc vers l'extérieur.
 *
 * Bandes courtes (80 px) : le flou se recalcule à chaque pixel de défilement,
 * sur toute la hauteur ce serait trop lourd pour un téléphone. Sans prise en
 * charge du flou, les bandes restent simplement transparentes.
 */
const HAUTEUR = 80
const COUCHES = [
  { flou: 1.5, jusqua: 100 },
  { flou: 4,   jusqua: 65 },
  { flou: 9,   jusqua: 35 },
]

function Bande({ cote, visible, decalage }: { cote: 'haut' | 'bas'; visible: boolean; decalage: number }) {
  const sens = cote === 'haut' ? 'to bottom' : 'to top'
  return (
    <div aria-hidden className="pcv-hide" style={{
      position: 'absolute', left: 0, right: 0, height: HAUTEUR,
      [cote === 'haut' ? 'top' : 'bottom']: decalage,
      zIndex: 26, pointerEvents: 'none',
      opacity: visible ? 1 : 0, transition: 'opacity .3s ease-out',
    } as CSSProperties}>
      {COUCHES.map(c => {
        const masque = `linear-gradient(${sens}, #000 0%, transparent ${c.jusqua}%)`
        return (
          <div key={c.flou} style={{
            position: 'absolute', inset: 0,
            backdropFilter: `blur(${c.flou}px)`, WebkitBackdropFilter: `blur(${c.flou}px)`,
            maskImage: masque, WebkitMaskImage: masque,
          }} />
        )
      })}
    </div>
  )
}

/**
 * `enHaut` / `auBout` : aux extrémités de la page, la bande correspondante
 * s'efface — on ne floute pas l'en-tête au repos, ni le dernier élément.
 */
export default function FlouBords({ bas, enHaut, auBout }: { bas: number; enHaut: boolean; auBout: boolean }) {
  return (
    <>
      <Bande cote="haut" visible={!enHaut} decalage={0} />
      <Bande cote="bas" visible={!auBout} decalage={bas} />
    </>
  )
}
