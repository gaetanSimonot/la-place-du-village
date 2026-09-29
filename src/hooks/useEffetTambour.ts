'use client'
import { useEffect, type RefObject } from 'react'

/**
 * L'EFFET TAMBOUR — la page vue de l'intérieur d'un cylindre.
 *
 * Chaque bloc se penche en 3D selon sa hauteur à l'écran : à plat au milieu,
 * basculé vers soi en approchant du bas (bord inférieur élargi, en trapèze),
 * et symétriquement en haut. Le texte suit : il fait partie du bloc.
 *
 * POURQUOI DU JS ET PAS `animation-timeline: view()`. La page du Village est
 * faite d'enveloppes `display: contents` (grille bureau, carrousels) — un
 * élément sans boîte ignore toute transformation — et d'un fil qui est un
 * seul bloc très haut, qui ne se pencherait que d'un tenant. On descend donc
 * dans l'arbre jusqu'aux vrais blocs : on traverse les enveloppes sans boîte
 * et ceux plus hauts que 60 % de l'écran.
 *
 * COÛT. Les positions se mesurent UNE fois (et à chaque changement de
 * contenu) ; à chaque image on ne lit que `scrollTop` et on n'écrit que des
 * `transform`, que le compositeur applique sans refaire la mise en page.
 *
 * ZONE MORTE au milieu : les blocs qu'on lit et qu'on touche restent à plat,
 * sans transform — donc sans le contexte d'empilement qu'un transform crée
 * (un menu qui déborde sur le bloc suivant passerait dessous).
 *
 * Téléphone seulement, et rien si « moins d'animations » est demandé.
 */
const ANGLE_MAX = 16          // degrés, tout au bord de l'écran
const GROSSISSEMENT = 0.05    // +5 % au bord : le tambour s'évase
const ZONE_MORTE = 0.35       // fraction de la demi-hauteur restée à plat
const PERSPECTIVE = 800       // px

interface Bloc { el: HTMLElement; centre: number; pose: string }

export function useEffetTambour(ref: RefObject<HTMLElement>, actif: boolean) {
  useEffect(() => {
    const cont = ref.current
    if (!actif || !cont) return
    if (window.matchMedia('(min-width: 1024px)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const racine = cont.firstElementChild as HTMLElement | null
    if (!racine) return

    let blocs: Bloc[] = []
    let raf = 0
    let minuteur: ReturnType<typeof setTimeout> | undefined

    const parcourir = (el: Element, seuil: number, out: HTMLElement[]) => {
      for (const enfant of Array.from(el.children) as HTMLElement[]) {
        const cs = getComputedStyle(enfant)
        if (cs.display === 'none') continue
        // Ce qui est collé à l'écran ne défile pas : le pencher le tordrait
        // en permanence.
        if (cs.position === 'fixed' || cs.position === 'sticky') continue
        if (cs.display === 'contents') { parcourir(enfant, seuil, out); continue }
        if (enfant.offsetHeight > seuil && enfant.children.length) { parcourir(enfant, seuil, out); continue }
        if (enfant.offsetHeight < 8) continue
        out.push(enfant)
      }
    }

    const appliquer = () => {
      const moitie = cont.clientHeight / 2
      const haut = cont.scrollTop
      for (const b of blocs) {
        const t = Math.max(-1.3, Math.min(1.3, (b.centre - haut - moitie) / moitie))
        const a = Math.abs(t)
        let pose = ''
        if (a > ZONE_MORTE) {
          // Courbe douce : 0 à la sortie de la zone morte, 1 au bord.
          const k = Math.min(1.3, (a - ZONE_MORTE) / (1 - ZONE_MORTE))
          const e = Math.sign(t) * k * k
          pose = `perspective(${PERSPECTIVE}px) rotateX(${(e * ANGLE_MAX).toFixed(2)}deg) scale(${(1 + GROSSISSEMENT * Math.abs(e)).toFixed(4)})`
        }
        if (pose !== b.pose) { b.el.style.transform = pose; b.pose = pose }
      }
    }

    const collecter = () => {
      for (const b of blocs) b.el.style.transform = ''
      const els: HTMLElement[] = []
      parcourir(racine, cont.clientHeight * 0.6, els)
      // Mesure à plat : un transform en place fausserait les rectangles.
      const base = cont.getBoundingClientRect().top - cont.scrollTop
      blocs = els.map(el => {
        const r = el.getBoundingClientRect()
        return { el, centre: r.top - base + r.height / 2, pose: '' }
      })
      appliquer()
    }

    const surDefile = () => {
      if (raf) return
      raf = requestAnimationFrame(() => { raf = 0; appliquer() })
    }
    const plusTard = () => { clearTimeout(minuteur); minuteur = setTimeout(collecter, 200) }

    collecter()
    cont.addEventListener('scroll', surDefile, { passive: true })
    window.addEventListener('resize', plusTard)
    const ro = new ResizeObserver(plusTard)
    ro.observe(racine)
    // Le contenu arrive par morceaux (agenda, cinéma, fil) : chaque ajout
    // déplace ce qui suit.
    const mo = new MutationObserver(plusTard)
    mo.observe(racine, { childList: true, subtree: true })

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(minuteur)
      cont.removeEventListener('scroll', surDefile)
      window.removeEventListener('resize', plusTard)
      ro.disconnect()
      mo.disconnect()
      for (const b of blocs) b.el.style.transform = ''
    }
  }, [ref, actif])
}
