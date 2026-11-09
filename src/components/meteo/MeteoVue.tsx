'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useAnimationControls, type PanInfo } from 'framer-motion'
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
  const [ouvert, setOuvert] = useState(false)
  const anim = useAnimationControls()
  useEffect(() => { anim.start({ y: ouvert ? 0 : decalageReplie, transition: { type: 'spring', damping: 32, stiffness: 320 } }) }, [ouvert, decalageReplie, anim])
  useEffect(() => { if (vueJours) setOuvert(true) }, [vueJours])
  const finGlisse = (_: unknown, info: PanInfo) => {
    if (info.velocity.y < -200 || info.offset.y < -40) setOuvert(true)
    else if (info.velocity.y > 200 || info.offset.y > 40) setOuvert(false)
  }

  const majLe = meta ? heure(Date.parse(meta.genere)) : null
  const valeurCurseur = iSel ?? Math.max(0, iMaintenant)

  return (
    <div className="pdv-meteo fixed inset-0 overflow-hidden" style={{ background: '#FDFAF5' }}>
      <div className="absolute inset-x-0 top-0 z-0" style={{ height: '100%' }}>
        {zone && (
          <CarteMeteo
            zone={zone}
            pluie={formesSel?.pluie ?? null}
            orage={formesSel?.orage ?? null}
            nuages={formesSel?.nuages ?? null}
            montrerPluie={montrerPluie}
            montrerNuages={montrerNuages}
            point={point}
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
        className="absolute inset-x-0 bottom-0 z-30 rounded-t-[26px]"
        style={{ height: hauteurPanneau, background: '#FDFAF5', boxShadow: '0 -6px 24px rgba(44,28,16,.14)', y: decalageReplie }}
        animate={anim}
      >
        <PoigneePanneau ouvert={ouvert} onBasculer={() => setOuvert(o => !o)} onGlisse={finGlisse} />
        <div className="h-[calc(100%-36px)] overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
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

/** La poignée : un appui bascule, un glissé remonte ou descend le panneau. */
function PoigneePanneau({ ouvert, onBasculer, onGlisse }: { ouvert: boolean; onBasculer: () => void; onGlisse: (e: unknown, i: PanInfo) => void }) {
  return (
    <motion.button
      type="button"
      aria-label={ouvert ? 'Replier le panneau' : 'Remonter le panneau'}
      onTap={onBasculer}
      onPanEnd={onGlisse}
      className="flex h-9 w-full items-center justify-center border-none bg-transparent"
      style={{ touchAction: 'none' }}
    >
      <span className="block h-[5px] w-11 rounded-full bg-[#D9CFC2]" />
    </motion.button>
  )
}
