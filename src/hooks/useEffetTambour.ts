'use client'
import { createContext, useEffect, type RefObject } from 'react'

/**
 * L'EFFET TAMBOUR — la page posée à l'intérieur d'un cylindre.
 *
 * Au milieu de l'écran, une bande plate. Au-delà, la page s'enroule sur un
 * cylindre de rayon R, concave vers soi : en approchant du bas, un bloc monte
 * vers l'œil et se couche (bord inférieur plus large), symétriquement en haut.
 * Le texte suit : il fait partie du bloc.
 *
 * UN SEUL POINT DE FUITE, AU CENTRE DE L'ÉCRAN. Une `perspective()` propre à
 * chaque bloc lui donnait son point de fuite à lui : chacun basculait dans son
 * coin, effet « planche qui pivote ». Poser `perspective` sur le panneau
 * donnerait un point commun, mais elle ne traverse pas les ancêtres qui
 * aplatissent la 3D (overflow hidden, coins rognés, opacité…), dont les cartes
 * du Village sont pleines, et ferait du panneau le repère des `position:
 * fixed`. On obtient le même point commun dans le transform de chaque bloc :
 *   translate(Δ) perspective(P) translate(−Δ) · [géométrie du cylindre]
 * où Δ va du centre du bloc au centre de l'écran. Indépendant des ancêtres.
 *
 * LA GÉOMÉTRIE. Pour un bloc à la distance d du centre (au-delà de la bande
 * plate Z) : s = d − Z, θ = s / R, puis
 *   y' = Z + R·sin θ   (il se rapproche du centre)
 *   z' = R·(1 − cos θ) (il monte vers l'œil — d'où le grossissement)
 *   rotateX(±θ)        (tangent au cylindre)
 * θ plafonne à ANGLE_MAX ; au-delà on continue en ligne droite, tangente.
 *
 * POURQUOI DU JS. La page est faite d'enveloppes `display: contents` (qui
 * ignorent toute transformation) et de blocs imbriqués inégalement. On
 * descend jusqu'aux vrais blocs : on traverse les enveloppes sans boîte et
 * tout bloc plus haut que SEUIL_BLOC de l'écran. Les images des publications
 * sont, elles, découpées en tranches (ImageTranches) : elles se tordent.
 *
 * LE HAUT ARRIVE PROGRESSIVEMENT : nul tant que la barre du haut est entière,
 * plein une fois qu'elle est sortie de l'écran.
 *
 * COÛT. Positions mesurées une fois (et à chaque changement de contenu) ; à
 * chaque image on ne lit que `scrollTop` et on n'écrit que des `transform`.
 * Dans la bande plate, les blocs n'ont AUCUN transform (pas de calque, pas de
 * contexte d'empilement) — sauf ceux qui en approchent le bord, qui gardent
 * `translateZ(0)` pour que leur calque ne naisse pas pile au moment de pencher.
 *
 * Téléphone seulement, et rien si « moins d'animations » est demandé.
 */
const RAYON = 0.9             // × hauteur visible, à la force 50 (réglage admin)
const ANGLE_MAX = 0.6         // rad
const PERSPECTIVE = 800       // px
const ZONE_PLATE = 0.35       // demi-hauteur plate, en fraction de la demi-hauteur
const MARGE_CALQUE = 0.1      // en deçà du bord de la zone plate : calque préparé
const SEUIL_BLOC = 0.25       // au-delà de ce quart d'écran, on découpe
const HORS_ECRAN = 50         // px au-delà du bord : plus de transform
// Mode « doigt » (essai) : l'écran s'enfonce sous le doigt qui fait défiler.
const SEUIL_ENFONCE = 10      // px de mouvement VERTICAL avant d'enfoncer
// Ressort (unités : secondes). À l'appui, amorti critique : le creux se forme
// sans dépasser. Au lâcher, sous-amorti : il remonte avec un petit rebond.
const RAIDEUR = 170
const AMORTI_APPUI = 1
const AMORTI_RELACHE = 0.5

/** Vrai quand les images du Village doivent se présenter en tranches. */
export const TambourContexte = createContext(false)

/** `centre` : ordonnée dans le contenu défilant ; `dx` : écart horizontal au centre de l'écran. */
interface Bloc { el: HTMLElement; centre: number; dx: number; demi: number; pose: string }

/** Réglages du mode doigt : profondeur du creux (px) et largeur (% de l'écran). */
export interface ReglagesCreux { profondeur: number; largeur: number }

/**
 * `force` : 10 à 100, 50 par défaut — le rayon du cylindre lui est inversement
 * proportionnel.
 *
 * `mode` :
 *  - 'cylindre' : la courbe fixe décrite plus haut.
 *  - 'doigt' (essai) : rien au repos. Dès que le doigt fait défiler (10 px de
 *    mouvement vertical — rien sur un tap, rien sur un glissé de côté dans un
 *    carrousel), l'écran s'ENFONCE sous lui comme une membrane : ce qui est
 *    sous le doigt recule (profil en cloche), ce qui l'entoure se penche vers
 *    le creux. Point de fuite : le doigt, en x et en y — ce qui est dessous
 *    recule sans glisser de côté. Le creux reste sous le doigt pendant qu'on
 *    fait défiler, le contenu glisse dessous. Au lâcher, retour à plat par un
 *    ressort, avec un petit rebond, en rAF — fluide pendant l'inertie aussi.
 *
 * Tactile en `passive: true`, jamais de preventDefault ; pas d'événements
 * pointer, que le navigateur annule (pointercancel) dès que le défilement part.
 */
export function useEffetTambour(
  ref: RefObject<HTMLElement>, actif: boolean, force = 50,
  mode: 'cylindre' | 'doigt' = 'cylindre', creuxReglages: ReglagesCreux = { profondeur: 80, largeur: 25 },
) {
  const { profondeur, largeur } = creuxReglages
  useEffect(() => {
    const cont = ref.current
    if (!actif || !cont) return
    if (window.matchMedia('(min-width: 1024px)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const racine = cont.firstElementChild as HTMLElement | null
    if (!racine) return

    let blocs: Bloc[] = []
    let hauteurBarre = 60
    let raf = 0
    let minuteur: ReturnType<typeof setTimeout> | undefined

    const parcourir = (el: Element, seuil: number, out: HTMLElement[]) => {
      for (const enfant of Array.from(el.children) as HTMLElement[]) {
        if (enfant.dataset.tambour === 'ignorer') continue
        const cs = getComputedStyle(enfant)
        if (cs.display === 'none') continue
        // Ce qui est collé à l'écran ne défile pas : le pencher le tordrait
        // en permanence.
        if (cs.position === 'fixed' || cs.position === 'sticky') continue
        if (cs.display === 'contents') { parcourir(enfant, seuil, out); continue }
        if (enfant.dataset.tranche !== undefined) { out.push(enfant); continue }
        if (enfant.offsetHeight > seuil && enfant.children.length) { parcourir(enfant, seuil, out); continue }
        if (enfant.offsetHeight < 8) continue
        out.push(enfant)
      }
    }

    // Mode doigt : où appuie le doigt (px, dans le panneau ; x depuis son
    // centre), et le creux : sa valeur (0 plat, 1 enfoncé, un peu négatif au
    // rebond) et sa vitesse, menées par un ressort.
    let doigtX = 0, doigtY = 0
    let creux = 0, vitesseCreux = 0, cibleCreux = 0
    let rafCreux = 0, avantCreux = 0
    let depart: { x: number; y: number } | null = null

    const appliquerDoigt = () => {
      const h = cont.clientHeight
      const moitie = h / 2
      const haut = cont.scrollTop
      const sigma = (largeur / 100) * h
      const D = profondeur * creux
      for (const b of blocs) {
        let pose = ''
        const horsEcran = Math.abs(b.centre - haut - moitie) - b.demi > moitie + HORS_ECRAN
        if (Math.abs(D) > 0.2 && !horsEcran) {
          const dy = b.centre - haut - doigtY       // du doigt au bloc
          const e = Math.exp(-((dy / sigma) ** 2))
          if (e > 0.01) {
            // Cloche : z = −D·e. Pente dz/dy = D·2·dy/σ²·e ; le bloc se couche
            // selon cette pente (le bord le plus loin du doigt vient vers soi).
            const z = -D * e
            const th = Math.max(-0.7, Math.min(0.7, Math.atan((D * 2 * dy) / (sigma * sigma) * e)))
            const dx = b.dx - doigtX
            pose = `translate(${(-dx).toFixed(1)}px, ${(-dy).toFixed(1)}px) perspective(${PERSPECTIVE}px) `
              + `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) `
              + `translate3d(0, 0, ${z.toFixed(1)}px) rotateX(${th.toFixed(4)}rad)`
          }
        }
        if (pose !== b.pose) { b.el.style.transform = pose; b.pose = pose }
      }
    }

    const appliquer = () => {
      if (mode === 'doigt') { appliquerDoigt(); return }
      const h = cont.clientHeight
      const moitie = h / 2
      const R = RAYON * h * (50 / Math.max(10, force))
      const Z = ZONE_PLATE * moitie
      const haut = cont.scrollTop
      const progresHaut = Math.min(1, haut / hauteurBarre)
      for (const b of blocs) {
        const dy = b.centre - haut - moitie          // du centre de l'écran au bloc, px
        const d = Math.abs(dy)
        const signe = dy < 0 ? -1 : 1
        let pose = ''
        // Entièrement hors de l'écran : aucun transform. Il n'est pas vu, et
        // la tangente, poursuivie loin, l'enverrait à la profondeur de la
        // caméra — projection démesurée et calque géant pour rien. Il
        // retrouve sa courbure en entrant.
        if (d - b.demi > moitie + HORS_ECRAN) {
          pose = ''
        } else if (d > Z) {
          const s = d - Z
          let y: number, z: number, th: number
          if (s / R <= ANGLE_MAX) {
            th = s / R
            y = Z + R * Math.sin(th)
            z = R * (1 - Math.cos(th))
          } else {
            // Au-delà de l'angle maximal : on file tout droit, tangent.
            th = ANGLE_MAX
            const reste = s - R * ANGLE_MAX
            y = Z + R * Math.sin(th) + reste * Math.cos(th)
            z = R * (1 - Math.cos(th)) + reste * Math.sin(th)
          }
          const k = signe < 0 ? progresHaut : 1
          const ty = (signe * y - dy) * k
          const tz = z * k
          const rx = signe * th * k
          if (Math.abs(rx) > 0.001) {
            // Point de fuite commun : on amène le centre de l'écran à
            // l'origine du bloc, on projette, on revient.
            //   translate(−dx, −dy) perspective(P) translate(dx, dy) · G
            pose = `translate(${(-b.dx).toFixed(1)}px, ${(-dy).toFixed(1)}px) perspective(${PERSPECTIVE}px) `
              + `translate(${b.dx.toFixed(1)}px, ${dy.toFixed(1)}px) `
              + `translate3d(0, ${ty.toFixed(1)}px, ${tz.toFixed(1)}px) rotateX(${rx.toFixed(4)}rad)`
          }
        } else if (d > Z - MARGE_CALQUE * moitie) {
          pose = 'translateZ(0)'
        }
        if (pose !== b.pose) { b.el.style.transform = pose; b.pose = pose }
      }
    }

    const collecter = () => {
      for (const b of blocs) b.el.style.transform = ''
      const els: HTMLElement[] = []
      parcourir(racine, cont.clientHeight * SEUIL_BLOC, els)
      hauteurBarre = Math.max(20, (racine.firstElementChild as HTMLElement | null)?.offsetHeight ?? 60)
      // Mesure à plat : un transform en place fausserait les rectangles.
      const rc = cont.getBoundingClientRect()
      const base = rc.top - cont.scrollTop
      const milieuX = rc.left + rc.width / 2
      blocs = els.map(el => {
        const r = el.getBoundingClientRect()
        return { el, centre: r.top - base + r.height / 2, dx: r.left + r.width / 2 - milieuX, demi: r.height / 2, pose: '' }
      })
      appliquer()
    }

    const surDefile = () => {
      if (raf) return
      raf = requestAnimationFrame(() => { raf = 0; appliquer() })
    }
    const plusTard = () => { clearTimeout(minuteur); minuteur = setTimeout(collecter, 200) }

    // Le ressort du creux, intégré image par image.
    const animerCreux = (t: number) => {
      const dt = avantCreux ? Math.min(t - avantCreux, 40) / 1000 : 1 / 60
      avantCreux = t
      const zeta = cibleCreux > 0 ? AMORTI_APPUI : AMORTI_RELACHE
      const acc = -RAIDEUR * (creux - cibleCreux) - 2 * zeta * Math.sqrt(RAIDEUR) * vitesseCreux
      vitesseCreux += acc * dt
      creux += vitesseCreux * dt
      const fini = Math.abs(creux - cibleCreux) < 0.002 && Math.abs(vitesseCreux) < 0.01
      if (fini) { creux = cibleCreux; vitesseCreux = 0 }
      appliquer()
      if (!fini) rafCreux = requestAnimationFrame(animerCreux)
      else { rafCreux = 0; avantCreux = 0 }
    }
    const lancerCreux = () => { if (!rafCreux) rafCreux = requestAnimationFrame(animerCreux) }
    const placerDoigt = (t: Touch) => {
      const rc = cont.getBoundingClientRect()
      doigtX = t.clientX - (rc.left + rc.width / 2)
      doigtY = t.clientY - rc.top
    }
    const appui = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!t || e.touches.length > 1) return
      depart = { x: t.clientX, y: t.clientY }
      placerDoigt(t)
    }
    const glisse = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!t) return
      placerDoigt(t)
      if (depart && cibleCreux === 0) {
        const dx = t.clientX - depart.x, dy = t.clientY - depart.y
        // Un glissé franchement vertical, et seulement lui, enfonce l'écran.
        if (Math.abs(dy) >= SEUIL_ENFONCE && Math.abs(dy) > Math.abs(dx)) { cibleCreux = 1; lancerCreux() }
        else if (Math.abs(dx) >= SEUIL_ENFONCE) depart = null // horizontal : ce geste n'enfoncera pas
      }
      if (!rafCreux) surDefile()
    }
    const lache = (e: TouchEvent) => {
      if (e.touches.length) return
      depart = null
      if (cibleCreux !== 0) { cibleCreux = 0; lancerCreux() }
    }
    if (mode === 'doigt') {
      cont.addEventListener('touchstart', appui, { passive: true })
      cont.addEventListener('touchmove', glisse, { passive: true })
      cont.addEventListener('touchend', lache, { passive: true })
      cont.addEventListener('touchcancel', lache, { passive: true })
    }

    collecter()
    cont.addEventListener('scroll', surDefile, { passive: true })
    window.addEventListener('resize', plusTard)
    const ro = new ResizeObserver(plusTard)
    ro.observe(racine)
    // Le contenu arrive par morceaux (agenda, cinéma, fil) : chaque AJOUT ou
    // RETRAIT de nœud déplace ce qui suit. On n'écoute que la liste des nœuds
    // (pas les attributs) : nos propres transform, le fondu du héros et le
    // défilement des carrousels, qui ne touchent qu'aux styles ou à
    // scrollLeft, ne relancent donc pas de collecte.
    const mo = new MutationObserver(plusTard)
    mo.observe(racine, { childList: true, subtree: true })

    return () => {
      cancelAnimationFrame(raf)
      cancelAnimationFrame(rafCreux)
      clearTimeout(minuteur)
      cont.removeEventListener('touchstart', appui)
      cont.removeEventListener('touchmove', glisse)
      cont.removeEventListener('touchend', lache)
      cont.removeEventListener('touchcancel', lache)
      cont.removeEventListener('scroll', surDefile)
      window.removeEventListener('resize', plusTard)
      ro.disconnect()
      mo.disconnect()
      for (const b of blocs) b.el.style.transform = ''
    }
  }, [ref, actif, force, mode, profondeur, largeur])
}
