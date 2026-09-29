'use client'
import { useEffect, useRef } from 'react'

/**
 * UN ROULEAU D'AFFICHES QUI AVANCE TOUT SEUL, TRÈS DOUCEMENT, SANS FIN.
 *
 * Téléphone seulement : au-dessus de 1024 px, le carrousel bureau
 * (desktop-cinema.css, `pcv-cineDefile`) défile déjà en CSS — les deux
 * mécanismes ensemble se battraient.
 *
 * On avance `scrollLeft` et non un `transform`.
 *
 * LE DÉFILEMENT VERTICAL EST PRIORITAIRE. Un doigt posé sur une affiche puis
 * tiré vers le haut doit faire défiler la PAGE ; laissé au navigateur, le
 * geste restait accroché au rouleau, qui ne bougeait qu'en largeur. D'où
 * `touch-action: pan-y` : le navigateur ne fait plus que le vertical, et
 * c'est ce hook qui mène l'horizontal — seulement quand le doigt part
 * franchement de côté (premier mouvement plus large que haut), avec un élan
 * à la fin. Un glissé horizontal n'ouvre pas l'affiche sous le doigt.
 *
 * Le doigt posé met en pause ; levé, le défilement reprend aussitôt (après
 * l'élan s'il y en a un), depuis là où il a été laissé.
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
/** Délai entre le doigt levé (ou la fin de l’élan) et la reprise du défilement. */
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

    /** Ramène une position dans [0, période[ : la boucle vaut aussi au pouce. */
    const boucle = (x: number) => ((x % periode) + periode) % periode

    const programmerReprise = () => {
      clearTimeout(reprise)
      reprise = setTimeout(() => {
        enPause = false
        pos = boucle(el.scrollLeft)
        el.scrollLeft = pos
        dernierPose = el.scrollLeft
        lancer()
      }, REPRISE_APRES_DOIGT)
    }

    // Le geste en cours : d'où il part, et dans quel axe il s'est décidé.
    let geste: { x0: number; y0: number; gauche0: number; axe: 'h' | 'v' | null; derX: number; derT: number; vitesse: number } | null = null
    let rafElan = 0
    let bloquerClic = false

    const doigtPose = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!t) return
      enPause = true
      clearTimeout(reprise)
      arreter()
      cancelAnimationFrame(rafElan); rafElan = 0
      geste = { x0: t.clientX, y0: t.clientY, gauche0: el.scrollLeft, axe: null, derX: t.clientX, derT: e.timeStamp, vitesse: 0 }
    }

    const doigtBouge = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!geste || !t) return
      const dx = t.clientX - geste.x0, dy = t.clientY - geste.y0
      if (!geste.axe) {
        if (Math.hypot(dx, dy) < 8) return
        // Plus large que haut : c'est pour le rouleau. Sinon la page défile
        // (le navigateur s'en charge, touch-action: pan-y) et on n'y touche pas.
        geste.axe = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
      }
      if (geste.axe !== 'h') return
      pos = boucle(geste.gauche0 - dx)
      el.scrollLeft = pos
      dernierPose = el.scrollLeft
      const dt = e.timeStamp - geste.derT
      if (dt > 0) geste.vitesse = 0.8 * ((t.clientX - geste.derX) / dt) + 0.2 * geste.vitesse
      geste.derX = t.clientX; geste.derT = e.timeStamp
    }

    const doigtLeve = () => {
      const g = geste
      geste = null
      if (!g || g.axe !== 'h') { programmerReprise(); return }
      // Un glissé de côté n'est pas un tap : on n'ouvre pas l'affiche.
      bloquerClic = true
      setTimeout(() => { bloquerClic = false }, 350)
      // L'élan : la vitesse du doigt, qui s'amortit.
      let v = -g.vitesse // px/ms, dans le sens du défilement
      let avantElan = 0
      const elan = (t: number) => {
        const dt = avantElan ? Math.min(t - avantElan, 50) : 16
        avantElan = t
        pos = boucle(pos + v * dt)
        el.scrollLeft = pos
        dernierPose = el.scrollLeft
        v *= Math.pow(0.94, dt / 16)
        if (Math.abs(v) > 0.02) rafElan = requestAnimationFrame(elan)
        else { rafElan = 0; programmerReprise() }
      }
      if (Math.abs(v) > 0.05) rafElan = requestAnimationFrame(elan)
      else programmerReprise()
    }
    const doigtAnnule = () => { geste = null; programmerReprise() }

    const clicApresGlisse = (e: MouseEvent) => {
      if (!bloquerClic) return
      e.preventDefault()
      e.stopPropagation()
    }
    const surVisibilite = () => (document.hidden ? arreter() : lancer())

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      if (visible) lancer(); else arreter()
    })
    io.observe(el)
    // Le vertical appartient au navigateur ; l'horizontal, c'est nous.
    const touchActionAvant = el.style.touchAction
    el.style.touchAction = 'pan-y'
    el.addEventListener('touchstart', doigtPose, { passive: true })
    el.addEventListener('touchmove', doigtBouge, { passive: true })
    el.addEventListener('touchend', doigtLeve, { passive: true })
    el.addEventListener('touchcancel', doigtAnnule, { passive: true })
    el.addEventListener('click', clicApresGlisse, true)
    document.addEventListener('visibilitychange', surVisibilite)
    lancer()

    return () => {
      arreter()
      clearTimeout(reprise)
      io.disconnect()
      cancelAnimationFrame(rafElan)
      el.style.touchAction = touchActionAvant
      el.removeEventListener('touchstart', doigtPose)
      el.removeEventListener('touchmove', doigtBouge)
      el.removeEventListener('touchend', doigtLeve)
      el.removeEventListener('touchcancel', doigtAnnule)
      el.removeEventListener('click', clicApresGlisse, true)
      document.removeEventListener('visibilitychange', surVisibilite)
      delete el.dataset.defile
    }
  }, [nbElements])

  return ref
}
