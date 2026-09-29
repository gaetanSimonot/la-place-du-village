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
 * LE HAUT arrive progressivement : la page écrit `--lpv-intensite` (0 → 1 à
 * mesure que la barre du haut sort de l'écran) directement sur la bande
 * (`refHaut`), au défilement. Ni rendu React à chaque pixel, ni variable sur
 * <html> — qui relançait le calcul de style de toute la page.
 *
 * JAMAIS D'OPACITÉ SUR UNE BANDE. Un élément d'opacité < 1 isole ses
 * descendants : leur `backdrop-filter` ne voit plus la page derrière, et le
 * flou DISPARAÎT en entier au lieu de s'atténuer. C'était le « des fois il y
 * est, des fois non » : flou présent à opacité 1 pile, absent en dessous.
 * L'intensité passe donc par l'ALPHA DU MASQUE de chaque couche.
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
        const masque = `radial-gradient(ellipse ${rx}% 100% at ${centre}, transparent ${c.debut}%, rgba(0,0,0,var(--lpv-intensite, 1)) 100%)`
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

export default function FlouBords({ bas, auBout, reglages, refHaut, refVignette, barre = 60 }: { bas: number; auBout: boolean; reglages: VillageEffets; refHaut?: Ref<HTMLDivElement>; refVignette?: Ref<HTMLDivElement>; barre?: number }) {
  const teinte = reglages.vignette === 'blanc' ? '255,255,255' : '0,0,0'
  const alpha = (reglages.vignetteForce / 100) * 0.7
  const fondVignette = `radial-gradient(ellipse 85% 75% at 50% 50%, rgba(${teinte},0) ${100 - reglages.vignetteTaille}%, rgba(${teinte},${alpha.toFixed(3)}) 100%)`
  // Les deux calques de la vignette se partagent l'écran par des masques
  // complémentaires, avec un fondu de 32 px à la limite de la barre.
  const masqueCorps = `linear-gradient(to bottom, transparent ${barre}px, #000 ${barre + 32}px)`
  const masqueHaut = `linear-gradient(to bottom, #000 ${barre}px, transparent ${barre + 32}px)`
  const calque: CSSProperties = {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: bas,
    zIndex: 26, pointerEvents: 'none', background: fondVignette,
  }
  return (
    <>
      {reglages.flou && (
        <>
          <Bande cote="haut" reglages={reglages} refBande={refHaut} style={{ top: 0, ['--lpv-intensite' as string]: 0 }} />
          <Bande cote="bas" reglages={reglages} style={{ bottom: bas, ['--lpv-intensite' as string]: auBout ? 0 : 1 }} />
        </>
      )}
      {/* LA VIGNETTE — un ovale transparent au centre, la teinte aux bords.
          Un simple dégradé : ne coûte rien au défilement. Sa TAILLE règle
          jusqu'où la teinte gagne vers le centre.

          Elle ne couvre pas la barre du haut, et RIEN n'y bouge au défilement :
          deux calques fixes. Le corps épargne la zone de la barre ; le haut
          la couvre, et c'est son OPACITÉ que la page fait monter à mesure que
          la barre sort (refVignette). Déplacer le bord de la vignette, comme
          avant, le faisait traîner derrière la page. */}
      {reglages.vignette !== 'aucune' && alpha > 0 && (
        <>
          <div aria-hidden className="pcv-hide" style={{ ...calque, maskImage: masqueCorps, WebkitMaskImage: masqueCorps }} />
          <div ref={refVignette} aria-hidden className="pcv-hide" style={{ ...calque, opacity: 0, maskImage: masqueHaut, WebkitMaskImage: masqueHaut }} />
        </>
      )}
    </>
  )
}
