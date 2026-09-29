'use client'
import type { CSSProperties, Ref } from 'react'
import type { VillageEffets } from '@/lib/villageEffets'

/**
 * FLOU DE BORD — la « mise au point macro » du Village — et sa vignette.
 *
 * Deux bandes posées sur la zone qui défile, en haut et en bas, qui floutent
 * ce qui passe dessous (`backdrop-filter`) sans rien intercepter du doigt.
 *
 * Un VRAI dégradé de flou : trois couches empilées, de plus en plus floues,
 * chacune masquée sur une tranche de plus en plus proche du bord.
 *
 * L'ARRONDI. Le masque de chaque couche est une ellipse centrée sur le bord
 * INTÉRIEUR de la bande. Très large (arrondi 0), elle se confond avec un
 * dégradé droit ; resserrée, le flou gagne les coins et le centre reste net —
 * le bord de la zone nette devient un ovale.
 *
 * LE HAUT arrive progressivement : la page écrit l'opacité de la bande du
 * haut (0 → 1 à mesure que la barre du haut sort de l'écran) directement
 * sur SON élément (`refHaut`), au défilement. Ni rendu React à chaque pixel,
 * ni variable sur <html> — qui relançait le calcul de style de toute la page.
 *
 * Bandes courtes : le flou se recalcule à chaque pixel de défilement ; sur
 * toute la hauteur ce serait trop lourd. Sans prise en charge du flou, les
 * bandes restent simplement transparentes.
 */
const COUCHES = [
  { part: 0.15, debut: 0 },
  { part: 0.45, debut: 35 },
  { part: 1,    debut: 65 },
]

function Bande({ cote, reglages, style, refBande }: { cote: 'haut' | 'bas'; reglages: VillageEffets; style: CSSProperties; refBande?: Ref<HTMLDivElement> }) {
  // Rayon horizontal de l'ellipse : immense à 0 (≈ dégradé droit), 60 % à 100.
  const rx = 60 + (100 - reglages.flouRond) ** 2 * 0.5
  const centre = cote === 'haut' ? '50% 100%' : '50% 0%'
  return (
    <div ref={refBande} aria-hidden className="pcv-hide" style={{
      position: 'absolute', left: 0, right: 0, height: reglages.flouTaille,
      zIndex: 26, pointerEvents: 'none', ...style,
    }}>
      {COUCHES.map(c => {
        const flou = Math.max(0.5, reglages.flouForce * c.part)
        const masque = `radial-gradient(ellipse ${rx}% 100% at ${centre}, transparent ${c.debut}%, #000 100%)`
        return (
          <div key={c.part} style={{
            position: 'absolute', inset: 0,
            backdropFilter: `blur(${flou}px)`, WebkitBackdropFilter: `blur(${flou}px)`,
            maskImage: masque, WebkitMaskImage: masque,
          }} />
        )
      })}
    </div>
  )
}

export default function FlouBords({ bas, auBout, reglages, refHaut }: { bas: number; auBout: boolean; reglages: VillageEffets; refHaut?: Ref<HTMLDivElement> }) {
  const teinte = reglages.vignette === 'blanc' ? '255,255,255' : '0,0,0'
  const alpha = (reglages.vignetteForce / 100) * 0.7
  return (
    <>
      {reglages.flou && (
        <>
          <Bande cote="haut" reglages={reglages} refBande={refHaut} style={{ top: 0, opacity: 0 }} />
          <Bande cote="bas" reglages={reglages} style={{ bottom: bas, opacity: auBout ? 0 : 1, transition: 'opacity .3s ease-out' }} />
        </>
      )}
      {/* LA VIGNETTE — un ovale transparent au centre, la teinte aux bords.
          Un simple dégradé : ne coûte rien au défilement. */}
      {reglages.vignette !== 'aucune' && alpha > 0 && (
        <div aria-hidden className="pcv-hide" style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: bas,
          zIndex: 26, pointerEvents: 'none',
          background: `radial-gradient(ellipse 85% 75% at 50% 50%, rgba(${teinte},0) 55%, rgba(${teinte},${alpha.toFixed(3)}) 100%)`,
        }} />
      )}
    </>
  )
}
