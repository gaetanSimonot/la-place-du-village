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
// Mode « défilement » (essai) : la courbe n'existe que pendant que la page bouge.
const ARRET_DEFILEMENT = 140  // ms sans événement de défilement = la page s'est arrêtée
// Ressort (unités : secondes). À la montée, amorti critique : la courbe
// s'installe sans dépasser. Au retour, sous-amorti : petit rebond à plat.
const RAIDEUR = 170
const AMORTI_MONTEE = 1
const AMORTI_RETOUR = 0.5

const CARTE_MAX = 0.6         // une carte plus haute que ça est quand même démontée

/** Un élément qui dessine son propre cadre : fond, bordure ou ombre. */
function estCarte(cs: CSSStyleDeclaration): boolean {
  return (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent')
    || cs.backgroundImage !== 'none'
    || parseFloat(cs.borderTopWidth) > 0
    || cs.boxShadow !== 'none'
}

/** Vrai quand les images du Village doivent se présenter en tranches. */
export const TambourContexte = createContext(false)

/** `centre` : ordonnée dans le contenu défilant ; `dx` : écart horizontal au centre de l'écran. */
interface Bloc { el: HTMLElement; centre: number; dx: number; demi: number; pose: string }

/**
 * `force` : 10 à 100, 50 par défaut — le rayon du cylindre lui est inversement
 * proportionnel.
 *
 * `mode` :
 *  - 'cylindre' : la courbe, en permanence.
 *  - 'defilement' (essai) : la MÊME courbe, centrée sur l'écran, mais qui
 *    n'existe que pendant que la page bouge. Elle monte dès le premier pixel
 *    de défilement, tient pendant l'élan, et revient à plat par un ressort à
 *    petit rebond quand tout s'arrête. Rien ne suit le doigt : un premier
 *    essai creusait l'écran SOUS le doigt, jugé trop agité.
 */
export function useEffetTambour(
  ref: RefObject<HTMLElement>, actif: boolean, force = 50,
  mode: 'cylindre' | 'defilement' = 'cylindre',
) {
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
        // Une CARTE (fond, bordure ou ombre à elle) ne se démonte pas : son
        // cadre resterait à plat pendant que son contenu se penche — carré
        // blanc immobile autour d'une publication, affiche rognée par sa
        // tuile. Elle se penche d'un bloc, cadre compris, tant qu'elle ne
        // dépasse pas CARTE_MAX de l'écran.
        if (estCarte(cs) && enfant.offsetHeight <= cont.clientHeight * CARTE_MAX) { out.push(enfant); continue }
        if (enfant.offsetHeight > seuil && enfant.children.length) { parcourir(enfant, seuil, out); continue }
        if (enfant.offsetHeight < 8) continue
        out.push(enfant)
      }
    }

    // L'intensité de la courbe : 1 en permanence en mode cylindre ; en mode
    // défilement, menée par un ressort entre 0 (plat) et 1 (un peu négative
    // au rebond du retour).
    let ampl = mode === 'defilement' ? 0 : 1
    let vitesseAmpl = 0, cibleAmpl = ampl
    let rafAmpl = 0, avantAmpl = 0
    let arret: ReturnType<typeof setTimeout> | undefined

    const appliquer = () => {
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
          const k = (signe < 0 ? progresHaut : 1) * ampl
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

    // Le ressort de l'intensité, intégré image par image. Il applique la
    // courbe lui-même tant qu'il bouge.
    const animerAmpl = (t: number) => {
      const dt = avantAmpl ? Math.min(t - avantAmpl, 40) / 1000 : 1 / 60
      avantAmpl = t
      const zeta = cibleAmpl > 0 ? AMORTI_MONTEE : AMORTI_RETOUR
      const acc = -RAIDEUR * (ampl - cibleAmpl) - 2 * zeta * Math.sqrt(RAIDEUR) * vitesseAmpl
      vitesseAmpl += acc * dt
      ampl += vitesseAmpl * dt
      const fini = Math.abs(ampl - cibleAmpl) < 0.002 && Math.abs(vitesseAmpl) < 0.01
      if (fini) { ampl = cibleAmpl; vitesseAmpl = 0 }
      appliquer()
      if (!fini) rafAmpl = requestAnimationFrame(animerAmpl)
      else { rafAmpl = 0; avantAmpl = 0 }
    }
    const lancerAmpl = () => { if (!rafAmpl) rafAmpl = requestAnimationFrame(animerAmpl) }

    // Mode défilement : chaque événement de défilement (doigt ou élan) tient
    // la courbe levée ; ARRET_DEFILEMENT ms de silence la renvoie à plat.
    const surDefileCourbe = () => {
      if (cibleAmpl !== 1) { cibleAmpl = 1; lancerAmpl() }
      clearTimeout(arret)
      arret = setTimeout(() => { cibleAmpl = 0; lancerAmpl() }, ARRET_DEFILEMENT)
      if (!rafAmpl) surDefile()
    }

    collecter()
    cont.addEventListener('scroll', mode === 'defilement' ? surDefileCourbe : surDefile, { passive: true })
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
      cancelAnimationFrame(rafAmpl)
      clearTimeout(minuteur)
      clearTimeout(arret)
      cont.removeEventListener('scroll', surDefileCourbe)
      cont.removeEventListener('scroll', surDefile)
      window.removeEventListener('resize', plusTard)
      ro.disconnect()
      mo.disconnect()
      for (const b of blocs) b.el.style.transform = ''
    }
  }, [ref, actif, force, mode])
}
