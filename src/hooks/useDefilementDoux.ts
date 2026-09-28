'use client'
import { useEffect, useRef } from 'react'

/**
 * UN ROULEAU D'AFFICHES QUI AVANCE TOUT SEUL, TRÈS DOUCEMENT, SANS FIN.
 *
 * Téléphone seulement : au-dessus de 1024 px, le carrousel bureau
 * (desktop-cinema.css, `pcv-cineDefile`) défile déjà en CSS — les deux
 * mécanismes ensemble se battraient.
 *
 * On avance `scrollLeft` et non un `transform` : le rouleau reste un rouleau
 * natif, qu'on pousse au pouce avec son élan. Le doigt prend la main tant
 * qu'il est posé ; levé, le défilement reprend AUSSITÔT, depuis là où il l'a
 * laissé — le temps seulement que l'élan éventuel s'éteigne (reprendre
 * pendant l'élan le couperait net).
 *
 * LA BOUCLE. La liste est écrite deux fois ; les éléments de la copie portent
 * `lpv-defileDup`, invisibles tant que la piste n'a pas `data-defile="1"`.
 * Quand on a parcouru une liste entière, on recule d'autant : la copie a pris
 * la place de l'original, le saut ne se voit pas. Si la liste tient dans
 * l'écran, rien ne bouge et la copie reste cachée — des affiches en double
 * côte à côte se verraient.
 *
 * Pas de boucle d'animation pour rien : arrêt hors écran, onglet caché, ou
 * « moins d'animations » demandé.
 */
const VITESSE = 10            // px par seconde — « très très très doucement »
/** Sans mouvement natif depuis ce délai, l'élan est fini : on reprend. */
const REPRISE_APRES_DOIGT = 150

export function useDefilementDoux<T extends HTMLElement>(nbElements: number) {
  const ref = useRef<T>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || nbElements < 2) return
    if (window.matchMedia('(min-width: 1024px)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    // La période = la largeur d'une liste, gap compris : de la 1re affiche à
    // la 1re affiche de la copie. Mesurée copie visible.
    el.dataset.defile = '1'
    const enfants = el.children
    const n = enfants.length / 2
    const premier = enfants[0] as HTMLElement | undefined
    const copie = enfants[n] as HTMLElement | undefined
    const periode = premier && copie ? copie.offsetLeft - premier.offsetLeft : 0
    if (!periode || periode <= el.clientWidth) {
      delete el.dataset.defile
      return
    }

    let pos = el.scrollLeft
    let dernierPose = pos
    let avant = 0
    let raf = 0
    let enPause = false
    let doigtSurPiste = false
    let visible = true
    let reprise: ReturnType<typeof setTimeout> | undefined

    const pas = (t: number) => {
      const dt = avant ? Math.min(t - avant, 100) : 0
      avant = t
      // Quelqu'un a bougé le rouleau (élan du pouce) : on repart de là.
      if (Math.abs(el.scrollLeft - dernierPose) > 2) pos = el.scrollLeft
      pos += (VITESSE * dt) / 1000
      if (pos >= periode) pos -= periode
      el.scrollLeft = pos
      dernierPose = el.scrollLeft
      raf = requestAnimationFrame(pas)
    }
    const lancer = () => {
      if (raf || enPause || !visible || document.hidden) return
      avant = 0
      raf = requestAnimationFrame(pas)
    }
    const arreter = () => { cancelAnimationFrame(raf); raf = 0 }

    const doigtPose = () => { enPause = true; doigtSurPiste = true; clearTimeout(reprise); arreter() }
    const programmerReprise = () => {
      clearTimeout(reprise)
      reprise = setTimeout(() => {
        enPause = false
        pos = el.scrollLeft
        // Revenu trop loin à gauche ou parti trop loin à droite au pouce :
        // on se remet dans la première liste, à la même image.
        if (pos >= periode) pos -= periode
        el.scrollLeft = pos
        dernierPose = el.scrollLeft
        lancer()
      }, REPRISE_APRES_DOIGT)
    }
    const doigtLeve = () => { doigtSurPiste = false; programmerReprise() }
    // Pendant l'élan qui suit le doigt levé, chaque mouvement repousse la
    // reprise : elle tombe à l'arrêt du rouleau, pas au milieu.
    const surDefileNatif = () => { if (enPause && !doigtSurPiste) programmerReprise() }
    const surVisibilite = () => (document.hidden ? arreter() : lancer())

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      if (visible) lancer(); else arreter()
    })
    io.observe(el)
    el.addEventListener('touchstart', doigtPose, { passive: true })
    el.addEventListener('touchend', doigtLeve, { passive: true })
    el.addEventListener('touchcancel', doigtLeve, { passive: true })
    el.addEventListener('pointerdown', doigtPose)
    el.addEventListener('pointerup', doigtLeve)
    el.addEventListener('scroll', surDefileNatif, { passive: true })
    document.addEventListener('visibilitychange', surVisibilite)
    lancer()

    return () => {
      arreter()
      clearTimeout(reprise)
      io.disconnect()
      el.removeEventListener('touchstart', doigtPose)
      el.removeEventListener('touchend', doigtLeve)
      el.removeEventListener('touchcancel', doigtLeve)
      el.removeEventListener('pointerdown', doigtPose)
      el.removeEventListener('pointerup', doigtLeve)
      el.removeEventListener('scroll', surDefileNatif)
      document.removeEventListener('visibilitychange', surVisibilite)
      delete el.dataset.defile
    }
  }, [nbElements])

  return ref
}
