'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, animate, useMotionValue, useDragControls, type PanInfo } from 'framer-motion'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import PanneauMeteo, { type HeureAffichee } from './PanneauMeteo'
import { useDonneesMeteo } from './useDonneesMeteo'
import { useTerritoire } from '@/components/TerritoireProvider'
import { useZonePerso } from '@/hooks/useZonePerso'
import { zoneMeteo, type JoursMeteo } from '@/lib/meteo/zone'
import {
  urlMeteo, valeurAu, dansZone, cielDe, etatEnMots, suiteEnMots, hauteurSoleil, joursAu, heure,
  type Point, type Jour,
} from '@/lib/meteo/lecture'
import { pluieEnFormes, orageEnFormes, nuagesEnFormes, type Couche } from '@/lib/meteo/contours'
import { dessinerVueEnsemble, type ImageCarte } from '@/lib/meteo/vueEnsemble'

const CarteMeteo = dynamic(() => import('./CarteMeteo'), { ssr: false })

/** Hauteur visible du panneau replié : la phrase, le curseur et les heures, en entier. */
const PANNEAU_REPLIE = 330
/** Une image toutes les … ms pendant l'animation. */
const CADENCE = 420
const CLE_POINT = 'pdv-meteo-point'

/**
 * /meteo — la carte de la pluie et des nuages, et sous elle, le temps qu'il
 * fait au point choisi. Toutes les valeurs viennent des fichiers publiés par
 * la tâche planifiée (cf. lib/meteo/production.ts).
 *
 * À l'ouverture, la carte rejoue les dernières heures jusqu'à maintenant,
 * puis s'arrête : on voit d'où vient la pluie. Le bouton lecture fait
 * défiler la suite.
 */
export default function MeteoVue() {
  const router = useRouter()
  const { territoire } = useTerritoire()
  const zone = zoneMeteo(territoire?.slug)
  const { zone: zonePerso } = useZonePerso()

  const [iSel, setISel] = useState<number | null>(null)
  const iSelRef = useRef<number | null>(null)
  iSelRef.current = iSel
  const [besoinLarge, setBesoinLarge] = useState(false)
  const { meta, erreur, cadres, iMaintenant, images, imagesLarges, rafraichir } = useDonneesMeteo(zone, besoinLarge, iSelRef)

  const [montrerPluie, setMontrerPluie] = useState(true)
  const [montrerNuages, setMontrerNuages] = useState(true)
  const [vueJours, setVueJours] = useState<3 | 10 | null>(null)
  const [joursBruts, setJoursBruts] = useState<JoursMeteo | null>(null)
  const [joursCharges, setJoursCharges] = useState(false)

  /* Le point regardé : celui touché sur la carte (retenu sur ce téléphone),
     sinon la zone réglée par la personne, sinon le bourg de la zone. */
  const [choix, setChoix] = useState<(Point & { nom: string }) | null>(null)
  useEffect(() => {
    try { const c = JSON.parse(localStorage.getItem(CLE_POINT) ?? 'null'); if (c && typeof c.lat === 'number') setChoix(c) } catch { /* rien */ }
  }, [])
  const { point, lieu } = useMemo(() => {
    if (zone && choix && dansZone(choix, zone)) return { point: { lat: choix.lat, lng: choix.lng }, lieu: choix.nom }
    if (zone && zonePerso && dansZone({ lat: zonePerso.lat, lng: zonePerso.lng }, zone)) return { point: { lat: zonePerso.lat, lng: zonePerso.lng }, lieu: 'chez vous' }
    return { point: zone ? { lat: zone.centre.lat, lng: zone.centre.lng } : { lat: 43.9333, lng: 3.7 }, lieu: zone?.centre.nom ?? '' }
  }, [zone, choix, zonePerso])
  const toucherCarte = useCallback((p: Point, nom: string | null) => {
    if (!zone) return
    if (!dansZone(p, zone)) { toast.info('Touchez un point des Cévennes : c’est là que la prévision est précise.'); return }
    const c = { lat: p.lat, lng: p.lng, nom: nom ?? 'ce point' }
    setChoix(c)
    try { localStorage.setItem(CLE_POINT, JSON.stringify(c)) } catch { /* rien */ }
    rafraichir()
  }, [zone, rafraichir])

  /* ── L'animation ──────────────────────────────────────────────────────
     `lecture` = jusqu'à quel index on avance (null = arrêt). À l'ouverture :
     des heures passées jusqu'à maintenant, une seule fois. */
  const [lecture, setLecture] = useState<number | null>(null)
  const ouvertureFaite = useRef(false)
  const passeCharge = iMaintenant > 0 && Array.from({ length: iMaintenant + 1 }, (_, i) => images.has(i)).every(Boolean)
  useEffect(() => {
    if (iMaintenant < 0 || ouvertureFaite.current) return
    const calme = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (iMaintenant === 0 || calme) { ouvertureFaite.current = true; setISel(iMaintenant); return }
    if (!passeCharge) { if (iSel === null && images.has(iMaintenant)) setISel(iMaintenant); return }
    ouvertureFaite.current = true
    setISel(0)
    setLecture(iMaintenant)
  }, [iMaintenant, passeCharge, images, iSel])
  useEffect(() => {
    if (lecture === null) return
    const id = window.setInterval(() => {
      setISel(i => {
        const n = (i ?? 0) + 1
        if (n > lecture) { setLecture(null); return i }
        // L'image suivante pas encore là : on attend un tour.
        return images.has(n) ? n : i
      })
    }, CADENCE)
    return () => window.clearInterval(id)
  }, [lecture, images])
  const choisir = (i: number) => { setLecture(null); setISel(i) }
  const lireOuPause = () => {
    if (lecture !== null) { setLecture(null); return }
    const fin = cadres.length - 1
    if ((iSel ?? 0) >= fin) setISel(Math.max(0, iMaintenant))
    setLecture(fin)
  }

  // La série au point, de maintenant à la fin.
  const serie = useMemo(() => {
    if (!zone || iMaintenant < 0) return []
    const out: { i: number; t: number; v: ReturnType<typeof valeurAu>; pas: number }[] = []
    for (let i = iMaintenant; i < cadres.length; i++) {
      const img = images.get(i)
      if (!img) break // la phrase attend les heures dans l'ordre
      const pas = i > 0 ? (cadres[i].t - cadres[i - 1].t) / 3_600_000 : 1
      out.push({ i, t: img.t, v: valeurAu(img, point, zone), pas })
    }
    return out
  }, [zone, cadres, images, point, iMaintenant])

  const ici = serie[0]
  const jourIci = ici ? hauteurSoleil(ici.t - 1_800_000, point) > 0 : true
  const etat = ici ? etatEnMots(ici.v, jourIci) : null
  const suite = ici && serie.length >= Math.min(8, cadres.length - iMaintenant) ? suiteEnMots(serie, 0) : ''

  const heures: HeureAffichee[] = useMemo(() => {
    if (iMaintenant < 0) return []
    return cadres.slice(iMaintenant).map((c, k) => {
      const i = iMaintenant + k
      const s = serie.find(x => x.i === i)
      return { i, t: c.t, ciel: s ? cielDe(s.v, hauteurSoleil(c.t - 1_800_000, point) > 0) : null, temp: s?.v.temp ?? null, pluie: s?.v.pluie ?? null }
    })
  }, [cadres, iMaintenant, serie, point])

  // Les formes de l'heure affichée — calculées une fois par heure.
  const formes = useRef(new Map<number, { pluie: Couche; orage: Couche; nuages: Couche }>())
  useEffect(() => { formes.current.clear() }, [meta])
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

  /* Vue rapprochée (zoom ≥ 8,5) : contours au kilomètre dans la zone fine,
     vue d'ensemble autour. Vue de loin : la vue d'ensemble seule. */
  const [rapproche, setRapproche] = useState(true)
  const dessins = useRef(new Map<string, ImageCarte>())
  useEffect(() => { dessins.current.clear() }, [meta])
  const affLarge = iSel !== null ? imagesLarges.get(iSel) : undefined
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

  /* ── Le panneau ───────────────────────────────────────────────────────
     Même mécanique que la feuille des événements (BottomSheet) : il suit le
     pouce, puis se pose en haut ou en bas selon l'élan. Replié, on
     l'attrape n'importe où ; déplié, par le haut, le reste défile. Un geste
     plutôt horizontal (heures, curseur) n'attrape rien. */
  const [hauteurEcran, setHauteurEcran] = useState(800)
  useEffect(() => {
    const maj = () => setHauteurEcran(window.innerHeight)
    maj(); window.addEventListener('resize', maj)
    return () => window.removeEventListener('resize', maj)
  }, [])
  const hauteurPanneau = Math.round(hauteurEcran * 0.86)
  const visibleReplie = Math.min(PANNEAU_REPLIE, Math.round(hauteurEcran * 0.45))
  const decalageReplie = Math.max(0, hauteurPanneau - visibleReplie)
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
    const dansEntete = e.clientY - haut < 110
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
  const nomPoint = lieu === 'chez vous' ? 'Chez vous' : lieu

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
            nomPoint={nomPoint}
            onToucher={toucherCarte}
            large={large}
            onSortieZone={() => setBesoinLarge(true)}
            basCarte={visibleReplie}
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
          className="flex h-8 w-full items-center justify-center border-none bg-transparent"
          style={{ touchAction: 'none' }}
        >
          <span className="block h-[5px] w-11 rounded-full bg-[#D9CFC2]" />
        </button>
        <div
          className="h-[calc(100%-32px)]"
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
              etat={etat}
              suite={suite}
              temp={ici?.v.temp ?? null}
              ciel={ici ? cielDe(ici.v, jourIci) : null}
              lieu={lieu}
              curseur={{ min: 0, max: Math.max(0, cadres.length - 1), valeur: valeurCurseur, maintenant: Math.max(0, iMaintenant), t: cadres[valeurCurseur]?.t ?? Date.now() }}
              enLecture={lecture !== null}
              onLecture={lireOuPause}
              heures={heures}
              charge={new Set(images.keys())}
              onChoisir={choisir}
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
