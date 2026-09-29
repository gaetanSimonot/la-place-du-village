'use client'
import { useContext, useEffect, useRef, useState } from 'react'
import { TambourContexte } from '@/hooks/useEffetTambour'

/**
 * UNE IMAGE EN TRANCHES, pour qu'elle se TORDE dans l'effet tambour.
 *
 * Un bloc qui se penche pivote d'un tenant : une grande photo de publication
 * faisait une planche qui bascule. Ici l'image est redessinée en bandes
 * horizontales empilées, chacune marquée `data-tranche` : useEffetTambour
 * penche chaque bande selon SA hauteur à l'écran.
 *
 * CHAQUE BANDE A LA TAILLE DE SA BANDE, pas celle de l'image : un calque par
 * bande, de la hauteur d'une bande. On y reproduit exactement le recadrage
 * `object-fit: cover` centré de l'<img> d'origine — taille du fond = image
 * naturelle mise à l'échelle du cadre, position décalée de la hauteur de la
 * bande. D'où la mesure du cadre (ResizeObserver) et de l'image naturelle.
 *
 * Les bandes se recouvrent de RECOUVREMENT px : penchées d'angles un peu
 * différents, elles laisseraient sinon passer un fil clair.
 *
 * Les coins arrondis du cadre passent sur la première et la dernière bande :
 * quand les tranches sont là, le cadre ne rogne plus (il couperait le bas
 * élargi des bandes) — ce sont elles qui portent le recadrage et l'arrondi.
 *
 * Rendu seulement sous TambourContexte (le Village, effet courbe allumé).
 */
const N = 10
const RECOUVREMENT = 2

export function useTranchesActives(): boolean {
  return useContext(TambourContexte)
}

export default function ImageTranches({ url, rayon = 0 }: { url: string; rayon?: number }) {
  const actif = useContext(TambourContexte)
  const ref = useRef<HTMLDivElement>(null)
  const [cadre, setCadre] = useState<{ l: number; h: number } | null>(null)
  const [nat, setNat] = useState<{ l: number; h: number } | null>(null)

  useEffect(() => {
    if (!actif) return
    const el = ref.current
    if (!el) return
    const mesurer = () => setCadre(c => (c && c.l === el.clientWidth && c.h === el.clientHeight ? c : { l: el.clientWidth, h: el.clientHeight }))
    mesurer()
    const ro = new ResizeObserver(mesurer)
    ro.observe(el)
    return () => ro.disconnect()
  }, [actif])

  useEffect(() => {
    if (!actif) return
    let vivant = true
    const img = new Image()
    img.onload = () => { if (vivant && img.naturalWidth) setNat({ l: img.naturalWidth, h: img.naturalHeight }) }
    img.src = url
    return () => { vivant = false }
  }, [actif, url])

  if (!actif) return null

  // Tant que le cadre ou l'image ne sont pas mesurés, l'image entière, à
  // plat : l'<img> d'origine est déjà invisible, il ne faut pas de trou.
  let bandes: React.ReactNode = (
    <div style={{
      position: 'absolute', inset: 0, borderRadius: rayon,
      backgroundImage: `url("${url}")`, backgroundSize: 'cover', backgroundPosition: 'center',
    }} />
  )
  if (cadre && nat && cadre.l > 0 && cadre.h > 0) {
    // Recadrage `cover` centré : l'image couvre le cadre, l'excédent part
    // également des deux côtés.
    const echelle = Math.max(cadre.l / nat.l, cadre.h / nat.h)
    const lf = nat.l * echelle, hf = nat.h * echelle
    const ox = (cadre.l - lf) / 2, oy = (cadre.h - hf) / 2
    const pas = cadre.h / N
    bandes = Array.from({ length: N }, (_, i) => {
      const haut = i * pas
      const hauteur = i === N - 1 ? cadre.h - haut : pas + RECOUVREMENT
      return (
        <div
          key={i}
          data-tranche=""
          style={{
            position: 'absolute', left: 0, right: 0, top: haut, height: hauteur,
            backgroundImage: `url("${url}")`,
            backgroundSize: `${lf}px ${hf}px`,
            backgroundPosition: `${ox}px ${oy - haut}px`,
            backgroundRepeat: 'no-repeat',
            borderRadius: i === 0 ? `${rayon}px ${rayon}px 0 0` : i === N - 1 ? `0 0 ${rayon}px ${rayon}px` : 0,
          }}
        />
      )
    })
  }

  return (
    <div ref={ref} aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {bandes}
    </div>
  )
}
