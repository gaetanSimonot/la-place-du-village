'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { urlMeteo, chargerImage, chargerVent, type Image } from '@/lib/meteo/lecture'
import { fenetreVent, type MetaMeteo, type ZoneMeteo } from '@/lib/meteo/zone'

export interface Cadre { t: number; png: string; large?: string; vent?: string }

/**
 * LES DONNÉES DE LA PAGE MÉTÉO — rien n'est chargé avant d'y entrer.
 *
 * Le fil des images va de l'heure en cours à la fin de la prévision.
 * Ordre de chargement : l'heure en cours d'abord (la phrase en dépend), puis
 * les suivantes. Chaque heure vient avec son vent. La vue d'ensemble (la
 * pluie à 400 km) se charge dès qu'on regarde de loin.
 */
export function useDonneesMeteo(zone: ZoneMeteo | null, besoinLarge: boolean, iSelRef: React.MutableRefObject<number | null>) {
  const [meta, setMeta] = useState<MetaMeteo | null>(null)
  const [erreur, setErreur] = useState(false)
  const [images, setImages] = useState<Map<number, Image>>(new Map())
  const [imagesLarges, setImagesLarges] = useState<Map<number, Image>>(new Map())
  const chargeA = useRef(0)
  const runRef = useRef<string | null>(null)

  const recharger = useCallback(() => {
    if (!zone) return
    chargeA.current = Date.now()
    fetch(urlMeteo(`${zone.slug}/meta.json`), { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((m: MetaMeteo) => {
        setErreur(false)
        // Une nouvelle sortie : on repart de zéro. Sinon on garde tout.
        if (runRef.current === m.run) return
        runRef.current = m.run
        setImages(new Map()); setImagesLarges(new Map())
        setMeta(m)
      })
      .catch(() => setErreur(true))
  }, [zone])
  useEffect(() => { recharger() }, [recharger])
  /** Relit la sortie publiée si la dernière lecture date de plus de 5 min. */
  const rafraichir = useCallback(() => { if (Date.now() - chargeA.current > 5 * 60_000) recharger() }, [recharger])

  // De l'heure en cours (une image d'heure t porte ce qui se passe entre
  // t − 1 h et t) à la fin de la prévision.
  const cadres: Cadre[] = useMemo(() => {
    if (!meta) return []
    const run = Date.parse(meta.run), now = Date.now()
    return meta.heures
      .map(h => ({ t: Date.parse(h.t), png: h.png, large: h.large, vent: h.vent }))
      .filter(h => h.t > run && h.t > now)
  }, [meta])

  useEffect(() => {
    if (!zone || !cadres.length) return
    let vivant = true
    let k = 0
    const gv = fenetreVent(zone)
    const suivant = async (): Promise<void> => {
      while (vivant && k < cadres.length) {
        const i = k++
        try {
          const [img, vent] = await Promise.all([
            chargerImage(cadres[i].png, cadres[i].t, zone),
            cadres[i].vent ? chargerVent(cadres[i].vent!, gv).catch(() => undefined) : Promise.resolve(undefined),
          ])
          img.vent = vent
          if (vivant) setImages(prev => new Map(prev).set(i, img))
        } catch { /* une image manquante n'arrête pas les autres */ }
      }
    }
    Promise.all([suivant(), suivant(), suivant()])
    return () => { vivant = false }
  }, [zone, cadres])

  useEffect(() => {
    if (!besoinLarge || !zone || !cadres.length) return
    let vivant = true
    const faits = new Set<number>()
    const suivant = async (): Promise<void> => {
      while (vivant) {
        // Toujours l'heure affichée en premier si elle manque encore.
        const depart = iSelRef.current ?? 0
        const ordre = cadres.map((_, k) => k).sort((a, b) => (a >= depart ? a - depart : 1000 - a) - (b >= depart ? b - depart : 1000 - b))
        const i = ordre.find(x => !faits.has(x) && cadres[x].large)
        if (i === undefined) return
        faits.add(i)
        try {
          const img = await chargerImage(cadres[i].large!, cadres[i].t, zone.large)
          if (vivant) setImagesLarges(prev => new Map(prev).set(i, img))
        } catch { /* idem */ }
      }
    }
    Promise.all([suivant(), suivant()])
    return () => { vivant = false }
  }, [besoinLarge, zone, cadres, iSelRef])

  return { meta, erreur, cadres, images, imagesLarges, rafraichir }
}
