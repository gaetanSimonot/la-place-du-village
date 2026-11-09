'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, animate, useMotionValue, useDragControls, type PanInfo } from 'framer-motion'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import PanneauMeteo, { quand, type DonneesHeure } from './PanneauMeteo'
import type { Colonne } from './FriseHeures'
import { useDonneesMeteo } from './useDonneesMeteo'
import BottomNavBar, { NAV_H } from '@/components/BottomNavBar'
import { useInterceptModal } from '@/contexts/InterceptModalContext'
import { useTerritoire } from '@/components/TerritoireProvider'
import { useZonePerso } from '@/hooks/useZonePerso'
import { zoneMeteo, type JoursMeteo } from '@/lib/meteo/zone'
import {
  urlMeteo, valeurAu, ventAu, dansZone, cielDe, etatEnMots, suiteEnMots, hauteurSoleil, joursAu, heure,
  type Point, type Jour,
} from '@/lib/meteo/lecture'
import { pluieEnFormes, orageEnFormes, type Couche } from '@/lib/meteo/contours'
import { dessinerVueEnsemble, type ImageCarte } from '@/lib/meteo/vueEnsemble'

const CarteMeteo = dynamic(() => import('./CarteMeteo'), { ssr: false })

/** Hauteur visible du panneau replié : l'heure choisie et la frise des heures. */
const PANNEAU_REPLIE = 248
/** Une image toutes les … ms quand on lance la lecture. */
const CADENCE = 450
const CLE_POINT = 'pdv-meteo-point'
/** Sous la barre du bas (masquée sur ordinateur, cf. globals.css). */
const BAS = `var(--meteo-bas, calc(${NAV_H}px + env(safe-area-inset-bottom, 0px)))`

/**
 * /meteo — la pluie sur la carte, la tuile de l'heure posée dessus, et sous
 * elle le temps qu'il fait au point choisi. Toutes les valeurs viennent des
 * fichiers publiés par la tâche planifiée (cf. lib/meteo/production.ts).
 *
 * Ouverte depuis l'app, la page vit dans le slot @modal par-dessus
 * l'accueil, qui reste monté : le retour la referme sans rien recharger.
 */
export default function MeteoVue() {
  const router = useRouter()
  const intercept = useInterceptModal()
  const { territoire } = useTerritoire()
  const zone = zoneMeteo(territoire?.slug)
  const { zone: zonePerso } = useZonePerso()

  const [iSel, setISel] = useState(0)
  const iSelRef = useRef<number | null>(0)
  iSelRef.current = iSel
  const [besoinLarge, setBesoinLarge] = useState(false)
  const { meta, erreur, cadres, images, imagesLarges, rafraichir } = useDonneesMeteo(zone, besoinLarge, iSelRef)

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

  // La lecture : défile d'heure en heure jusqu'à la fin, puis s'arrête.
  const [lecture, setLecture] = useState(false)
  useEffect(() => {
    if (!lecture) return
    const id = window.setInterval(() => {
      setISel(i => {
        const n = i + 1
        if (n >= cadres.length) { setLecture(false); return i }
        return images.has(n) ? n : i // l'image suivante pas encore là : on attend
      })
    }, CADENCE)
    return () => window.clearInterval(id)
  }, [lecture, images, cadres.length])
  const choisir = (i: number) => { setLecture(false); setISel(i) }
  const lireOuPause = () => {
    if (lecture) { setLecture(false); return }
    if (iSel >= cadres.length - 1) setISel(0)
    setLecture(true)
  }

  // La série au point, de maintenant à la fin.
  const serie = useMemo(() => {
    if (!zone) return []
    const out: { i: number; t: number; v: ReturnType<typeof valeurAu>; pas: number }[] = []
    for (let i = 0; i < cadres.length; i++) {
      const img = images.get(i)
      if (!img) break // la phrase attend les heures dans l'ordre
      const pas = i > 0 ? (cadres[i].t - cadres[i - 1].t) / 3_600_000 : 1
      out.push({ i, t: img.t, v: valeurAu(img, point, zone), pas })
    }
    return out
  }, [zone, cadres, images, point])

  const suite = serie[0] && serie.length >= Math.min(8, cadres.length) ? suiteEnMots(serie, 0) : ''

  // La frise : une colonne par heure, vide tant que son image n'est pas là.
  const colonnes: Colonne[] = useMemo(() => cadres.map((c, i) => {
    const img = images.get(i)
    return { t: c.t, pas: i > 0 ? (c.t - cadres[i - 1].t) / 3_600_000 : 1, v: img && zone ? valeurAu(img, point, zone) : null }
  }), [cadres, images, point, zone])

  // L'en-tête du panneau : l'heure sous l'aiguille, au point choisi.
  const affichee = images.get(iSel)
  const hSel: DonneesHeure | null = useMemo(() => {
    if (!affichee || !zone) return null
    const v = valeurAu(affichee, point, zone)
    const jour = hauteurSoleil(affichee.t - 1_800_000, point) > 0
    return {
      t: affichee.t, maintenant: iSel === 0, ciel: cielDe(v, jour), etat: etatEnMots(v, jour),
      temp: v.temp, pluie: v.pluie, nuages: v.nuages, vent: affichee.vent ? ventAu(affichee.vent, point) : null,
    }
  }, [affichee, zone, point, iSel])

  // Les formes de pluie de l'heure affichée — calculées une fois par heure.
  const formes = useRef(new Map<number, { pluie: Couche; orage: Couche }>())
  useEffect(() => { formes.current.clear() }, [meta])
  const formesSel = useMemo(() => {
    if (!affichee || !zone) return null
    let f = formes.current.get(iSel)
    if (!f) { f = { pluie: pluieEnFormes(affichee, zone), orage: orageEnFormes(affichee, zone) }; formes.current.set(iSel, f) }
    return f
  }, [affichee, zone, iSel])

  /* Vue rapprochée (zoom ≥ 8,5) : contours au kilomètre dans la zone fine,
     vue d'ensemble autour. Vue de loin : la vue d'ensemble seule. */
  const [rapproche, setRapproche] = useState(false)
  const dessins = useRef(new Map<string, ImageCarte>())
  useEffect(() => { dessins.current.clear() }, [meta])
  const affLarge = imagesLarges.get(iSel)
  const large = useMemo(() => {
    if (!affLarge || !zone) return null
    const cle = `${iSel}-${rapproche ? 1 : 0}`
    let d = dessins.current.get(cle)
    if (!d) { d = dessinerVueEnsemble(affLarge, zone, { trou: rapproche }); dessins.current.set(cle, d) }
    return d
  }, [affLarge, zone, iSel, rapproche])
  // Tant que la vue d'ensemble n'est pas là, les contours restent affichés.
  const contoursVisibles = rapproche || !large

  // Les jours : « 3 jours » est déplié d'office, chargé à l'ouverture.
  const [vueJours, setVueJours] = useState<3 | 10>(3)
  const [joursBruts, setJoursBruts] = useState<JoursMeteo | null>(null)
  const [joursCharges, setJoursCharges] = useState(false)
  useEffect(() => {
    if (!zone) return
    fetch(urlMeteo(`${zone.slug}/jours.json`), { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : null))
      .then((j: JoursMeteo | null) => setJoursBruts(j))
      .catch(() => {})
      .finally(() => setJoursCharges(true))
  }, [zone])
  const jours: Jour[] | null = joursBruts ? joursAu(joursBruts, point, vueJours) : null

  /* ── Le panneau ───────────────────────────────────────────────────────
     Même mécanique que la feuille des événements (BottomSheet) : il suit le
     pouce, puis se pose en haut ou en bas selon l'élan. Replié, on
     l'attrape n'importe où ; déplié, par le haut, le reste défile. */
  const [hauteurEcran, setHauteurEcran] = useState(800)
  useEffect(() => {
    const maj = () => setHauteurEcran(window.innerHeight)
    maj(); window.addEventListener('resize', maj)
    return () => window.removeEventListener('resize', maj)
  }, [])
  const hauteurPanneau = Math.round((hauteurEcran - NAV_H) * 0.84)
  const decalageReplie = Math.max(0, hauteurPanneau - PANNEAU_REPLIE)
  const [ouvert, setOuvert] = useState(false)
  const y = useMotionValue(decalageReplie)
  const prise = useDragControls()
  const geste = useRef<{ x: number; y: number; libre: boolean } | null>(null)
  const panneauRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const c = animate(y, ouvert ? 0 : decalageReplie, { type: 'spring', stiffness: 340, damping: 36 })
    return () => c.stop()
  }, [ouvert, decalageReplie, y])
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

  // Le retour : referme la météo posée sur l'accueil, sans le recharger.
  const retour = () => {
    if (intercept) { intercept.close(); return }
    if (window.history.length > 1) router.back()
    else router.push('/?tab=village')
  }

  const majLe = meta ? heure(Date.parse(meta.genere)) : null
  const nomPoint = lieu === 'chez vous' ? 'Chez vous' : lieu

  return (
    // En modale, elle couvre aussi l'en-tête du site sur ordinateur : on
    // n'y laisse pas la place de cet en-tête (pdv-meteo-modale).
    <div className={`pdv-meteo fixed inset-0 overflow-hidden${intercept ? ' pdv-meteo-modale' : ''}`} style={{ background: '#FDFAF5' }}>
      <div className="absolute inset-x-0 top-0 z-0" style={{ bottom: BAS }}>
        {zone && (
          <CarteMeteo
            zone={zone}
            pluie={contoursVisibles ? formesSel?.pluie ?? null : null}
            orage={contoursVisibles ? formesSel?.orage ?? null : null}
            onEchelle={setRapproche}
            point={point}
            nomPoint={nomPoint}
            onToucher={toucherCarte}
            large={large}
            onSortieZone={() => setBesoinLarge(true)}
            basCarte={PANNEAU_REPLIE}
          />
        )}
      </div>

      {/* Barre du haut, posée sur la carte : retour et titre. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-2 px-3" style={{ paddingTop: 'max(10px, env(safe-area-inset-top, 10px))' }}>
        <button
          type="button"
          onClick={retour}
          aria-label="Retour"
          className="pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-none bg-white text-[#2D5A3D]"
          style={{ boxShadow: '0 2px 10px rgba(44,28,16,.12)' }}
        >
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        {/* L'heure que montre la carte, comme l'horodatage d'un radar. */}
        <span className="pointer-events-auto flex h-11 items-center gap-2 rounded-full bg-white pl-3.5 pr-4 text-[#2D5A3D]" style={{ boxShadow: '0 2px 10px rgba(44,28,16,.12)' }}>
          <span className="font-title text-[17px] font-extrabold">Météo</span>
          {cadres[iSel] && (
            <>
              <span className="h-4 w-px bg-[#E5DDD2]" aria-hidden />
              <span className="text-[14px] font-bold text-[#1A1209]">{quand(cadres[iSel].t, iSel === 0)}</span>
            </>
          )}
        </span>
      </div>

      {/* Le panneau, qu'on remonte. */}
      <motion.div
        ref={panneauRef}
        className="absolute inset-x-0 z-30 rounded-t-[26px]"
        style={{ bottom: BAS, height: hauteurPanneau, background: '#FDFAF5', boxShadow: '0 -6px 24px rgba(44,28,16,.14)', y }}
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
          {erreur || (meta && !cadres.length) ? (
            <p className="m-0 px-5 py-6 text-[16px] font-bold text-[#7A6A5A]">
              La carte se met à jour, revenez dans quelques minutes.
            </p>
          ) : !zone ? (
            <p className="m-0 px-5 py-6 text-[16px] font-bold text-[#7A6A5A]">La météo n’est pas encore disponible pour ce territoire.</p>
          ) : (
            <PanneauMeteo
              h={hSel}
              suite={suite}
              lieu={lieu}
              colonnes={colonnes}
              iSel={iSel}
              onChoisir={choisir}
              enLecture={lecture}
              onLecture={lireOuPause}
              ouvert={ouvert}
              vueJours={vueJours}
              onVueJours={setVueJours}
              jours={jours}
              joursCharges={joursCharges}
              majLe={majLe}
            />
          )}
        </div>
      </motion.div>

      {/* La navigation de l'app, comme partout. */}
      <BottomNavBar />
    </div>
  )
}
