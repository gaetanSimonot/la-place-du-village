'use client'
import { useEffect, useRef } from 'react'

/**
 * UN ROULEAU D'AFFICHES QUI AVANCE TOUT SEUL, TRÈS DOUCEMENT, SANS FIN.
 *
 * LE ROULEAU N'EST PAS UNE ZONE QUI DÉFILE. C'est une piste qu'on DÉPLACE
 * (`transform`) dans un cadre qui la rogne (son parent, `overflow: hidden`).
 * Quand c'était une vraie zone défilante que ce hook faisait avancer
 * (`scrollLeft` à chaque image), le téléphone la voyait « en train de
 * défiler » : le premier glissé vertical posé sur une affiche servait à
 * l'arrêter et ne faisait pas défiler la page ; il fallait un second coup.
 * Plus de zone défilante sous le doigt : le vertical va toujours à la page,
 * dès le premier coup.
 *
 * L'horizontal au doigt est mené ici (`touch-action: pan-y` sur le cadre :
 * le navigateur ne garde que le vertical) : quand le doigt part franchement
 * de côté (premier mouvement plus large que haut), la piste le suit, avec un
 * élan à la fin, et boucle. Un glissé de côté n'ouvre pas l'affiche.
 *
 * LA BOUCLE. La liste est écrite deux fois ; la copie porte `pcv-cineDup` ou
 * `lpv-defileDup`, invisible tant que la piste n'a pas `data-defile="1"`.
 * Une liste entière parcourue, on recule d'autant : la copie a pris la place
 * de l'original, le saut ne se voit pas. Si la liste tient dans le cadre,
 * rien ne bouge et la copie reste cachée.
 *
 * Téléphone seulement : au-dessus de 1024 px, le carrousel bureau
 * (desktop-cinema.css) anime la piste en CSS. « Moins d'animations » : pas
 * de défilement automatique, mais le doigt fait toujours glisser la piste.
 */
const VITESSE = 10            // px par seconde — « très très très doucement »
/** Délai entre le doigt levé (ou la fin de l'élan) et la reprise du défilement. */
const REPRISE_APRES_DOIGT = 150

export function useDefilementDoux<T extends HTMLElement>(nbElements: number) {
  const ref = useRef<T>(null)

  useEffect(() => {
    const piste = ref.current
    const cadre = piste?.parentElement
    if (!piste || !cadre || nbElements < 2) return
    if (window.matchMedia('(min-width: 1024px)').matches) return
    const auto = !window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // La période = la largeur d'une liste, gap compris : de la 1re affiche à
    // la 1re affiche de la copie. Mesurée copie visible.
    piste.dataset.defile = '1'
    const enfants = piste.children
    const n = enfants.length / 2
    const premier = enfants[0] as HTMLElement | undefined
    const copie = enfants[n] as HTMLElement | undefined
    const periode = premier && copie ? copie.offsetLeft - premier.offsetLeft : 0
    if (!periode || periode <= cadre.clientWidth) {
      delete piste.dataset.defile
      return
    }

    let pos = 0
    let avant = 0
    let raf = 0
    let rafElan = 0
    let enPause = false
    let visible = true
    let reprise: ReturnType<typeof setTimeout> | undefined

    /** Ramène une position dans [0, période[ : la boucle vaut aussi au doigt. */
    const boucle = (x: number) => ((x % periode) + periode) % periode
    const poser = () => { piste.style.transform = `translate3d(${(-pos).toFixed(2)}px, 0, 0)` }

    const pas = (t: number) => {
      const dt = avant ? Math.min(t - avant, 100) : 0
      avant = t
      pos = boucle(pos + (VITESSE * dt) / 1000)
      poser()
      raf = requestAnimationFrame(pas)
    }
    const lancer = () => {
      if (!auto || raf || enPause || !visible || document.hidden) return
      avant = 0
      raf = requestAnimationFrame(pas)
    }
    const arreter = () => { cancelAnimationFrame(raf); raf = 0 }
    const programmerReprise = () => {
      clearTimeout(reprise)
      reprise = setTimeout(() => { enPause = false; lancer() }, REPRISE_APRES_DOIGT)
    }

    // Le geste en cours : d'où il part, et dans quel axe il s'est décidé.
    let geste: { x0: number; y0: number; pos0: number; axe: 'h' | 'v' | null; derX: number; derT: number; vitesse: number } | null = null
    let bloquerClic = false

    const doigtPose = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!t) return
      enPause = true
      clearTimeout(reprise)
      arreter()
      cancelAnimationFrame(rafElan); rafElan = 0
      geste = { x0: t.clientX, y0: t.clientY, pos0: pos, axe: null, derX: t.clientX, derT: e.timeStamp, vitesse: 0 }
    }

    const doigtBouge = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!geste || !t) return
      const dx = t.clientX - geste.x0, dy = t.clientY - geste.y0
      if (!geste.axe) {
        if (Math.hypot(dx, dy) < 8) return
        // Plus large que haut : c'est pour la piste. Sinon la page défile
        // (le navigateur s'en charge) et on n'y touche pas.
        geste.axe = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
      }
      if (geste.axe !== 'h') return
      pos = boucle(geste.pos0 - dx)
      poser()
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
      let v = -g.vitesse // px/ms, dans le sens de la piste
      let avantElan = 0
      const elan = (t: number) => {
        const dt = avantElan ? Math.min(t - avantElan, 50) : 16
        avantElan = t
        pos = boucle(pos + v * dt)
        poser()
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
    io.observe(cadre)

    // Le cadre rogne la piste ; le vertical appartient au navigateur.
    const cadreAvant = { overflow: cadre.style.overflow, touchAction: cadre.style.touchAction }
    cadre.style.overflow = 'hidden'
    cadre.style.touchAction = 'pan-y'
    cadre.addEventListener('touchstart', doigtPose, { passive: true })
    cadre.addEventListener('touchmove', doigtBouge, { passive: true })
    cadre.addEventListener('touchend', doigtLeve, { passive: true })
    cadre.addEventListener('touchcancel', doigtAnnule, { passive: true })
    cadre.addEventListener('click', clicApresGlisse, true)
    document.addEventListener('visibilitychange', surVisibilite)
    poser()
    lancer()

    return () => {
      arreter()
      cancelAnimationFrame(rafElan)
      clearTimeout(reprise)
      io.disconnect()
      cadre.style.overflow = cadreAvant.overflow
      cadre.style.touchAction = cadreAvant.touchAction
      cadre.removeEventListener('touchstart', doigtPose)
      cadre.removeEventListener('touchmove', doigtBouge)
      cadre.removeEventListener('touchend', doigtLeve)
      cadre.removeEventListener('touchcancel', doigtAnnule)
      cadre.removeEventListener('click', clicApresGlisse, true)
      document.removeEventListener('visibilitychange', surVisibilite)
      piste.style.transform = ''
      delete piste.dataset.defile
    }
  }, [nbElements])

  return ref
}
