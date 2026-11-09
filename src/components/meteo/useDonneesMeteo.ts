'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { urlMeteo, chargerImage, type Image } from '@/lib/meteo/lecture'
import type { MetaMeteo, ZoneMeteo } from '@/lib/meteo/zone'

export interface Cadre { t: number; png: string; large?: string; passe: boolean }

/**
 * LES DONNÉES DE LA PAGE MÉTÉO — rien n'est chargé avant d'y entrer.
 *
 * Le fil des images : les heures passées (gardées par la tâche planifiée,
 * jusqu'à 12 h), puis la prévision. Ordre de chargement : l'heure présente
 * d'abord (la phrase en dépend), puis le passé (l'animation d'ouverture le
 * rejoue), puis l'avenir. La vue d'ensemble ne se charge que si on dézoome.
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

  const cadres: Cadre[] = useMemo(() => {
    if (!meta) return []
    const run = Date.parse(meta.run)
    const avenir = meta.heures.filter(h => Date.parse(h.t) > run).map(h => ({ t: Date.parse(h.t), png: h.png, large: h.large, passe: false }))
    const debut = avenir[0]?.t ?? Infinity
    const passe = (meta.passe ?? []).map(h => ({ t: Date.parse(h.t), png: h.png, large: h.large, passe: true })).filter(h => h.t < debut)
    return [...passe, ...avenir]
  }, [meta])

  // L'image « maintenant » : celle de l'heure en cours (une image d'heure t
  // porte ce qui se passe entre t − 1 h et t).
  const iMaintenant = useMemo(() => cadres.findIndex(c => c.t > Date.now()), [cadres])

  const ordre = useCallback((depart: number) => {
    const idx = cadres.map((_, i) => i)
    return [depart, ...idx.filter(i => i < depart).reverse(), ...idx.filter(i => i > depart)]
  }, [cadres])

  useEffect(() => {
    if (!zone || iMaintenant < 0) return
    let vivant = true
    const file = ordre(iMaintenant)
    let k = 0
    const suivant = async (): Promise<void> => {
      while (vivant && k < file.length) {
        const i = file[k++]
        try {
          const img = await chargerImage(cadres[i].png, cadres[i].t, zone)
          if (vivant) setImages(prev => new Map(prev).set(i, img))
        } catch { /* une image manquante n'arrête pas les autres */ }
      }
    }
    Promise.all([suivant(), suivant(), suivant()])
    return () => { vivant = false }
  }, [zone, cadres, iMaintenant, ordre])

  useEffect(() => {
    if (!besoinLarge || !zone || iMaintenant < 0) return
    let vivant = true
    const faits = new Set<number>()
    const suivant = async (): Promise<void> => {
      while (vivant) {
        // Toujours l'heure affichée en premier si elle manque encore.
        const i = ordre(iSelRef.current ?? iMaintenant).find(x => !faits.has(x) && cadres[x].large)
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
  }, [besoinLarge, zone, cadres, iMaintenant, ordre, iSelRef])

  return { meta, erreur, cadres, iMaintenant, images, imagesLarges, rafraichir }
}
