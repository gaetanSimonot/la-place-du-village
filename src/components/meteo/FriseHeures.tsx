'use client'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { heure, type Valeur } from '@/lib/meteo/lecture'
import { COULEURS_PLUIE, COULEUR_ORAGE, SEUIL_PLUIE, SEUIL_MODEREE, SEUIL_FORTE } from '@/lib/meteo/zone'

export interface Colonne { t: number; pas: number; v: Valeur | null }

/** Largeur d'une heure dans la frise. */
const COL = 32
const H_TEMP = 30
const H_PLUIE = 46
const H_HEURES = 18

const fmtJour = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', timeZone: 'Europe/Paris' })
const fmtCle = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })

function couleur(v: Valeur): string {
  if (v.orage) return COULEUR_ORAGE
  if (v.pluie >= SEUIL_FORTE) return COULEURS_PLUIE[2]
  if (v.pluie >= SEUIL_MODEREE) return COULEURS_PLUIE[1]
  return COULEURS_PLUIE[0]
}
/** Hauteur de la barre : racine de l'intensité, plafonnée à 15 mm/h. */
const hauteurPluie = (mm: number) => (mm < SEUIL_PLUIE ? 0 : 6 + Math.min(1, Math.sqrt(mm / 15)) * (H_PLUIE - 8))

/**
 * La frise des heures : on la fait glisser sous l'aiguille fixe du milieu.
 * Chaque heure y est une barre de pluie (même couleurs que la carte), la
 * courbe des températures court au-dessus. L'heure sous l'aiguille est celle
 * de la carte et de l'en-tête du panneau.
 */
export default function FriseHeures({ colonnes, valeur, onChoisir, panneauOuvert }: {
  colonnes: Colonne[]
  valeur: number
  onChoisir: (i: number) => void
  panneauOuvert: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [largeur, setLargeur] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setLargeur(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const marge = Math.max(0, largeur / 2 - COL / 2)

  /* Le défilement mène : l'heure sous l'aiguille devient l'heure choisie.
     Quand c'est le programme qui fait défiler (lecture, toucher d'une heure),
     on attend d'être arrivé avant d'écouter à nouveau. */
  const auto = useRef<number | null>(null)
  const valeurRef = useRef(valeur)
  valeurRef.current = valeur
  const premier = useRef(true)
  useEffect(() => {
    const el = ref.current
    if (!el || !largeur) return
    if (Math.round(el.scrollLeft / COL) === valeur) { premier.current = false; return }
    auto.current = valeur
    el.scrollTo({ left: valeur * COL, behavior: premier.current ? 'auto' : 'smooth' })
    premier.current = false
  }, [valeur, largeur])
  const surDefilement = () => {
    const el = ref.current
    if (!el) return
    const k = Math.max(0, Math.min(colonnes.length - 1, Math.round(el.scrollLeft / COL)))
    if (auto.current !== null) { if (k === auto.current) auto.current = null; return }
    if (k !== valeurRef.current) onChoisir(k)
  }
  const reprendre = () => { auto.current = null }

  // La courbe des températures, par morceaux (une heure manquante la coupe).
  const courbe = useMemo(() => {
    const temps = colonnes.flatMap(c => (c.v ? [c.v.temp] : []))
    if (!temps.length) return null
    const min = Math.min(...temps), max = Math.max(...temps)
    const y = (t: number) => H_TEMP - 5 - ((t - min) / Math.max(1, max - min)) * (H_TEMP - 17)
    let d = ''
    colonnes.forEach((c, k) => {
      if (!c.v) return
      const x = k * COL + COL / 2
      d += `${k && colonnes[k - 1].v ? 'L' : 'M'}${x},${y(c.v.temp).toFixed(1)}`
    })
    return { d, y }
  }, [colonnes])

  const libelles = colonnes.map((c, k) => {
    const jour = fmtCle.format(new Date(c.t))
    const nouveauJour = k > 0 && jour !== fmtCle.format(new Date(colonnes[k - 1].t))
    const h = parseInt(heure(c.t), 10)
    const montrer = c.pas >= 3 || h % 3 === 0
    return { nouveauJour, texte: nouveauJour ? fmtJour.format(new Date(c.t)).replace('.', '') : montrer ? heure(c.t) : '' }
  })

  return (
    <div className="relative" data-frise>
      <div
        ref={ref}
        onScroll={surDefilement}
        onPointerDown={reprendre}
        onWheel={reprendre}
        className="pdv-frise overflow-x-auto overflow-y-hidden"
        style={{ scrollSnapType: 'x mandatory', touchAction: panneauOuvert ? 'pan-x pan-y' : 'pan-x', overscrollBehaviorX: 'contain' }}
      >
        <div className="relative flex" style={{ width: colonnes.length * COL + 2 * marge, paddingLeft: marge }}>
          {courbe && (
            <svg className="pointer-events-none absolute top-0" style={{ left: marge }} width={colonnes.length * COL} height={H_TEMP} aria-hidden>
              <path d={courbe.d} fill="none" stroke="#2D5A3D" strokeOpacity={0.55} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
              {colonnes.map((c, k) => c.v && libelles[k].texte && k !== valeur && (
                <text key={k} x={k * COL + COL / 2} y={courbe.y(c.v.temp) - 5} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#7A6A5A">
                  {Math.round(c.v.temp)}°
                </text>
              ))}
            </svg>
          )}
          {colonnes.map((c, k) => {
            const sel = k === valeur
            const hp = c.v ? hauteurPluie(c.v.pluie) : 0
            return (
              <button
                key={c.t}
                type="button"
                onClick={() => { auto.current = null; onChoisir(k) }}
                aria-label={`${heure(c.t)}${c.v ? `, ${Math.round(c.v.temp)} degrés` : ''}`}
                aria-pressed={sel}
                className="relative shrink-0 border-none bg-transparent p-0"
                style={{ width: COL, height: H_TEMP + H_PLUIE + H_HEURES, scrollSnapAlign: 'center' }}
              >
                {libelles[k].nouveauJour && (
                  <span aria-hidden className="absolute left-0 w-px" style={{ top: H_TEMP - 2, height: H_PLUIE + 2, background: '#D9CFC2' }} />
                )}
                <span aria-hidden className="absolute inset-x-0 flex items-end justify-center" style={{ top: H_TEMP, height: H_PLUIE }}>
                  {!c.v ? (
                    <span className="mb-0 block h-[3px] w-[14px] rounded-full bg-[#EFE8DE]" />
                  ) : hp ? (
                    <span className="block w-[16px] rounded-t-[5px] rounded-b-[2px]" style={{ height: hp, background: couleur(c.v), opacity: sel ? 1 : 0.85 }} />
                  ) : (
                    <span className="block h-[3px] w-[14px] rounded-full bg-[#E5DDD2]" />
                  )}
                </span>
                <span
                  aria-hidden
                  className="absolute inset-x-[-6px] bottom-0 text-center leading-none"
                  style={{
                    height: H_HEURES, paddingTop: 5, fontSize: libelles[k].nouveauJour ? 11 : 10.5,
                    fontWeight: libelles[k].nouveauJour ? 800 : 600,
                    color: libelles[k].nouveauJour ? '#2D5A3D' : '#8A7A6A',
                    visibility: sel ? 'hidden' : 'visible',
                  }}
                >
                  {libelles[k].texte}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* L'aiguille : fixe au milieu, la frise glisse dessous. */}
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2" style={{ height: H_TEMP + H_PLUIE + H_HEURES }}>
        <span className="absolute left-1/2 w-[2px] -translate-x-1/2 rounded-full bg-[#2D5A3D]" style={{ top: 2, bottom: H_HEURES - 2 }} />
        <span className="absolute left-1/2 top-0 h-[9px] w-[9px] -translate-x-1/2 rounded-full border-2 border-[#2D5A3D] bg-[#FDFAF5]" />
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#2D5A3D] px-1.5 text-[10.5px] font-extrabold leading-[16px] text-white">
          {colonnes[valeur] ? heure(colonnes[valeur].t) : ''}
        </span>
      </div>
    </div>
  )
}
