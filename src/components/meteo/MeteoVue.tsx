'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, animate, useMotionValue, useDragControls, type PanInfo } from 'framer-motion'
import dynamic from 'next/dynamic'
import PanneauMeteo, { type HeureAffichee } from './PanneauMeteo'
import { useTerritoire } from '@/components/TerritoireProvider'
import { useZonePerso } from '@/hooks/useZonePerso'
import { zoneMeteo, type MetaMeteo, type JoursMeteo } from '@/lib/meteo/zone'
import {
  urlMeteo, chargerImage, valeurAu, dansZone, cielDe, etatEnMots, suiteEnMots, hauteurSoleil, joursAu, heure,
  type Image, type Point, type Jour,
} from '@/lib/meteo/lecture'
import { pluieEnFormes, orageEnFormes, nuagesEnFormes, type Couche } from '@/lib/meteo/contours'
import { dessinerVueEnsemble, type ImageCarte } from '@/lib/meteo/vueEnsemble'

const CarteMeteo = dynamic(() => import('./CarteMeteo'), { ssr: false })

/** Part de l'écran laissée à la carte quand le panneau est replié. */
const PART_CARTE = 0.66

/**
 * /meteo — la carte de la pluie et des nuages, et sous elle, le temps qu'il
 * fait au village. Toutes les valeurs viennent des fichiers publiés par la
 * tâche planifiée (cf. lib/meteo/production.ts).
 */
export default function MeteoVue() {
  const router = useRouter()
  const { territoire } = useTerritoire()
  const zone = zoneMeteo(territoire?.slug)
  const { zone: zonePerso } = useZonePerso()

  const [meta, setMeta] = useState<MetaMeteo | null>(null)
  const [erreur, setErreur] = useState(false)
  const [images, setImages] = useState<Map<number, Image>>(new Map())
  const [iSel, setISel] = useState<number | null>(null)
  const [montrerPluie, setMontrerPluie] = useState(true)
  const [montrerNuages, setMontrerNuages] = useState(true)
  const [vueJours, setVueJours] = useState<3 | 10 | null>(null)
  const [joursBruts, setJoursBruts] = useState<JoursMeteo | null>(null)
  const [joursCharges, setJoursCharges] = useState(false)

  // Le village : la zone réglée par la personne si elle tombe dans la carte,
  // sinon le bourg par défaut de la zone.
  const point: Point = useMemo(() => {
    if (zone && zonePerso && dansZone({ lat: zonePerso.lat, lng: zonePerso.lng }, zone)) return { lat: zonePerso.lat, lng: zonePerso.lng }
    return zone ? { lat: zone.centre.lat, lng: zone.centre.lng } : { lat: 43.9333, lng: 3.7 }
  }, [zone, zonePerso])
  const lieu = zone && zonePerso && dansZone({ lat: zonePerso.lat, lng: zonePerso.lng }, zone) ? 'chez vous' : zone?.centre.nom ?? ''

  useEffect(() => {
    if (!zone) return
    fetch(urlMeteo(`${zone.slug}/meta.json`), { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((m: MetaMeteo) => setMeta(m))
      .catch(() => setErreur(true))
  }, [zone])

  // L'image « maintenant » : celle de l'heure en cours (une image d'heure t
  // porte ce qui se passe entre t − 1 h et t).
  const iMaintenant = useMemo(() => {
    if (!meta) return -1
    const now = Date.now()
    return meta.heures.findIndex(h => Date.parse(h.t) > now)
  }, [meta])

  useEffect(() => { if (iMaintenant >= 0 && iSel === null) setISel(iMaintenant) }, [iMaintenant, iSel])

  // Préchargement : d'abord les heures qui viennent, dans l'ordre.
  useEffect(() => {
    if (!meta || !zone || iMaintenant < 0) return
    let vivant = true
    const ordre = meta.heures.map((_, i) => i).filter(i => i >= iMaintenant)
    let k = 0
    const suivant = async (): Promise<void> => {
      while (vivant && k < ordre.length) {
        const i = ordre[k++]
        try {
          const img = await chargerImage(meta.heures[i].png, Date.parse(meta.heures[i].t), zone)
          if (vivant) setImages(prev => new Map(prev).set(i, img))
        } catch { /* une image manquante n'arrête pas les autres */ }
      }
    }
    Promise.all([suivant(), suivant(), suivant()])
    return () => { vivant = false }
  }, [meta, zone, iMaintenant])

  // La série au village, image par image.
  const serie = useMemo(() => {
    if (!meta || !zone || iMaintenant < 0) return []
    const out: { i: number; t: number; v: ReturnType<typeof valeurAu>; pas: number }[] = []
    for (let i = iMaintenant; i < meta.heures.length; i++) {
      const img = images.get(i)
      if (!img) break // la phrase attend les heures dans l'ordre
      const pas = i > 0 ? (Date.parse(meta.heures[i].t) - Date.parse(meta.heures[i - 1].t)) / 3_600_000 : 1
      out.push({ i, t: img.t, v: valeurAu(img, point, zone), pas })
    }
    return out
  }, [meta, zone, images, point, iMaintenant])

  const ici = serie[0]
  const jourIci = ici ? hauteurSoleil(ici.t - 1_800_000, point) > 0 : true
  const phrase = ici && serie.length >= Math.min(8, (meta?.heures.length ?? 0) - iMaintenant)
    ? `${etatEnMots(ici.v, jourIci)}, ${suiteEnMots(serie, 0)}`
    : ici ? etatEnMots(ici.v, jourIci) : null

  const heures: HeureAffichee[] = useMemo(() => {
    if (!meta || iMaintenant < 0) return []
    return meta.heures.slice(iMaintenant).map((h, k) => {
      const i = iMaintenant + k
      const s = serie.find(x => x.i === i)
      const t = Date.parse(h.t)
      return { i, t, ciel: s ? cielDe(s.v, hauteurSoleil(t - 1_800_000, point) > 0) : null, temp: s?.v.temp ?? null, pluie: s?.v.pluie ?? null }
    })
  }, [meta, iMaintenant, serie, point])

  // Les formes de l'heure affichée — calculées une fois par heure.
  const formes = useRef(new Map<number, { pluie: Couche; orage: Couche; nuages: Couche }>())
  const affichee = iSel !== null ? images.get(iSel) : undefined
  const formesSel = useMemo(() => {
    if (!affichee || !zone || iSel === null) return null
    let f = formes.current.get(iSel)
    if (!f) {
      f = { pluie: pluieEnFormes(affichee, zone), orage: orageEnFormes(affichee, zone), nuages: nuagesEnFormes(affichee, zone) }
      formes.current.set(iSel, f)
    }
    return f
  }, [affichee, zone, iSel])

  /* La vue d'ensemble (400 km, 5 km de maille) : rien n'est chargé tant
     qu'on reste dans la zone fine. Dès qu'on en sort, l'heure affichée
     d'abord, puis les suivantes. */
  const [besoinLarge, setBesoinLarge] = useState(false)
  const [imagesLarges, setImagesLarges] = useState<Map<number, Image>>(new Map())
  const iSelRef = useRef(iSel)
  iSelRef.current = iSel
  useEffect(() => {
    if (!besoinLarge || !meta || !zone || iMaintenant < 0) return
    let vivant = true
    const faits = new Set<number>()
    const suivant = async (): Promise<void> => {
      while (vivant) {
        // Toujours l'heure affichée en premier si elle manque encore.
        const depart = iSelRef.current ?? iMaintenant
        const ordre = meta.heures.map((_, i) => i).filter(i => i >= iMaintenant)
          .sort((a, b) => (a >= depart ? a - depart : 1000 + depart - a) - (b >= depart ? b - depart : 1000 + depart - b))
        const i = ordre.find(k => !faits.has(k) && meta.heures[k].large)
        if (i === undefined) return
        faits.add(i)
        try {
          const img = await chargerImage(meta.heures[i].large!, Date.parse(meta.heures[i].t), zone.large)
          if (vivant) setImagesLarges(prev => new Map(prev).set(i, img))
        } catch { /* une image manquante n'arrête pas les autres */ }
      }
    }
    Promise.all([suivant(), suivant()])
    return () => { vivant = false }
  }, [besoinLarge, meta, zone, iMaintenant])
  const dessins = useRef(new Map<string, ImageCarte>())
  const affLarge = iSel !== null ? imagesLarges.get(iSel) : undefined
  /* Vue rapprochée (zoom ≥ 8,5) : contours au kilomètre dans la zone fine,
     vue d'ensemble autour. Vue de loin : la vue d'ensemble seule. */
  const [rapproche, setRapproche] = useState(true)
  const large = useMemo(() => {
    if (!affLarge || !zone || iSel === null || (!montrerPluie && !montrerNuages)) return null
    const cle = `${iSel}-${montrerPluie ? 1 : 0}${montrerNuages ? 1 : 0}${rapproche ? 1 : 0}`
    let d = dessins.current.get(cle)
    if (!d) { d = dessinerVueEnsemble(affLarge, zone, { pluie: montrerPluie, nuages: montrerNuages, trou: rapproche }); dessins.current.set(cle, d) }
    return d
  }, [affLarge, zone, iSel, montrerPluie, montrerNuages, rapproche])
  // Tant que la vue d'ensemble n'est pas là, les contours restent affichés.
  const contoursVisibles = rapproche || !large

  // Les jours : chargés au premier appui sur « 3 jours » ou « 10 jours ».
  useEffect(() => {
    if (!vueJours || joursBruts || !zone) return
    fetch(urlMeteo(`${zone.slug}/jours.json`), { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : null))
      .then((j: JoursMeteo | null) => setJoursBruts(j))
      .catch(() => {})
      .finally(() => setJoursCharges(true))
  }, [vueJours, joursBruts, zone])
  const jours: Jour[] | null = joursBruts && vueJours ? joursAu(joursBruts, point, vueJours) : null

  // Le panneau : replié, il laisse ~70 % à la carte ; on le remonte au doigt.
  const [hauteurEcran, setHauteurEcran] = useState(800)
  useEffect(() => {
    const maj = () => setHauteurEcran(window.innerHeight)
    maj(); window.addEventListener('resize', maj)
    return () => window.removeEventListener('resize', maj)
  }, [])
  const hauteurPanneau = Math.round(hauteurEcran * 0.86)
  const decalageReplie = Math.max(0, hauteurPanneau - Math.round(hauteurEcran * (1 - PART_CARTE)))
  /* Même mécanique que la feuille des événements (BottomSheet) : le panneau
     suit le pouce en continu, puis se pose en haut ou en bas selon l'élan.
     Replié, on l'attrape n'importe où ; déplié, par le haut (poignée et
     phrase), le reste défile. Un geste plutôt horizontal (rangée des heures,
     curseur) n'attrape rien. */
  const [ouvert, setOuvert] = useState(false)
  const y = useMotionValue(decalageReplie)
  const prise = useDragControls()
  const geste = useRef<{ x: number; y: number; libre: boolean } | null>(null)
  const panneauRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const c = animate(y, ouvert ? 0 : decalageReplie, { type: 'spring', stiffness: 340, damping: 36 })
    return () => c.stop()
  }, [ouvert, decalageReplie, y])
  useEffect(() => { if (vueJours) setOuvert(true) }, [vueJours])
  const gesteDebut = (e: React.PointerEvent) => {
    const cible = e.target as HTMLElement
    const haut = panneauRef.current?.getBoundingClientRect().top ?? 0
    const dansEntete = e.clientY - haut < 120
    const surCurseur = cible.closest('input[type="range"]')
    geste.current = { x: e.clientX, y: e.clientY, libre: !surCurseur && (!ouvert || dansEntete) }
  }
  const gesteMouvement = (e: React.PointerEvent) => {
    const g = geste.current
    if (!g || !g.libre) return
    const dx = e.clientX - g.x, dy = e.clientY - g.y
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) { g.libre = false; return }
    if (Math.abs(dy) < 6) return
    g.libre = false
    prise.start(e)
  }
  const finGlisse = (_: unknown, info: PanInfo) => {
    const vy = info.velocity.y
    if (vy > 400) setOuvert(false)
    else if (vy < -400) setOuvert(true)
    else {
      const versOuvert = y.get() < decalageReplie / 2
      // Même cible qu'avant : l'effet ne se relance pas, on repose à la main.
      if (versOuvert === ouvert) animate(y, ouvert ? 0 : decalageReplie, { type: 'spring', stiffness: 340, damping: 36 })
      setOuvert(versOuvert)
    }
  }

  const majLe = meta ? heure(Date.parse(meta.genere)) : null
  const valeurCurseur = iSel ?? Math.max(0, iMaintenant)

  return (
    <div className="pdv-meteo fixed inset-0 overflow-hidden" style={{ background: '#FDFAF5' }}>
      <div className="absolute inset-x-0 top-0 z-0" style={{ height: '100%' }}>
        {zone && (
          <CarteMeteo
            zone={zone}
            pluie={contoursVisibles ? formesSel?.pluie ?? null : null}
            orage={contoursVisibles ? formesSel?.orage ?? null : null}
            nuages={contoursVisibles ? formesSel?.nuages ?? null : null}
            onEchelle={setRapproche}
            montrerPluie={montrerPluie}
            montrerNuages={montrerNuages}
            point={point}
            nomPoint={lieu === 'chez vous' ? 'Chez vous' : lieu}
            large={large}
            onSortieZone={() => setBesoinLarge(true)}
            basCarte={Math.round(hauteurEcran * (1 - PART_CARTE))}
          />
        )}
      </div>

      {/* Barre du haut, posée sur la carte : retour, titre, couches. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-2 px-3" style={{ paddingTop: 'max(10px, env(safe-area-inset-top, 10px))' }}>
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? router.back() : router.push('/'))}
          aria-label="Retour"
          className="pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-none bg-white text-[#2D5A3D]"
          style={{ boxShadow: '0 2px 10px rgba(44,28,16,.12)' }}
        >
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <span className="pointer-events-auto rounded-full bg-white px-3.5 py-2 font-title text-[17px] font-extrabold text-[#2D5A3D]" style={{ boxShadow: '0 2px 10px rgba(44,28,16,.12)' }}>
          Météo
        </span>
        <div className="pointer-events-auto ml-auto flex overflow-hidden rounded-full bg-white" style={{ boxShadow: '0 2px 10px rgba(44,28,16,.12)' }}>
          {([['Nuages', montrerNuages, setMontrerNuages], ['Pluie', montrerPluie, setMontrerPluie]] as const).map(([l, actif, set]) => (
            <button
              key={l}
              type="button"
              aria-pressed={actif}
              onClick={() => set(!actif)}
              className="h-11 border-none px-4 text-[14px] font-extrabold"
              style={{ background: actif ? '#2D5A3D' : 'transparent', color: actif ? '#FFFFFF' : '#2D5A3D' }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Le panneau, qu'on remonte. */}
      <motion.div
        ref={panneauRef}
        className="absolute inset-x-0 bottom-0 z-30 rounded-t-[26px]"
        style={{ height: hauteurPanneau, background: '#FDFAF5', boxShadow: '0 -6px 24px rgba(44,28,16,.14)', y }}
        drag="y"
        dragControls={prise}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: decalageReplie }}
        dragElastic={0.05}
        dragMomentum={false}
        onDragEnd={finGlisse}
        onPointerDown={gesteDebut}
        onPointerMove={gesteMouvement}
        onPointerUp={() => { geste.current = null }}
      >
        <button
          type="button"
          aria-label={ouvert ? 'Replier le panneau' : 'Remonter le panneau'}
          onClick={() => setOuvert(o => !o)}
          className="flex h-9 w-full items-center justify-center border-none bg-transparent"
          style={{ touchAction: 'none' }}
        >
          <span className="block h-[5px] w-11 rounded-full bg-[#D9CFC2]" />
        </button>
        <div
          className="h-[calc(100%-36px)]"
          style={{ overflowY: ouvert ? 'auto' : 'hidden', overscrollBehavior: 'contain', touchAction: ouvert ? 'pan-y' : 'none' }}
        >
          {erreur || (meta && iMaintenant < 0) ? (
            <p className="m-0 px-5 py-6 text-[16px] font-bold text-[#7A6A5A]">
              La carte se met à jour, revenez dans quelques minutes.
            </p>
          ) : !zone ? (
            <p className="m-0 px-5 py-6 text-[16px] font-bold text-[#7A6A5A]">La météo n’est pas encore disponible pour ce territoire.</p>
          ) : (
            <PanneauMeteo
              phrase={phrase}
              temp={ici?.v.temp ?? null}
              ciel={ici ? cielDe(ici.v, jourIci) : null}
              lieu={lieu}
              curseur={{ min: Math.max(0, iMaintenant), max: Math.max(0, (meta?.heures.length ?? 1) - 1), valeur: valeurCurseur, t: meta ? Date.parse(meta.heures[valeurCurseur]?.t ?? meta.heures[0].t) : Date.now() }}
              heures={heures}
              charge={new Set(images.keys())}
              onChoisir={setISel}
              vueJours={vueJours}
              onVueJours={setVueJours}
              jours={jours}
              joursCharges={joursCharges}
              majLe={majLe}
            />
          )}
        </div>
      </motion.div>
    </div>
  )
}
