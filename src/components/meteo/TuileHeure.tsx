'use client'
import IconeCiel from './IconeCiel'
import { heure, directionEnMots, type Ciel } from '@/lib/meteo/lecture'

const fmtJour = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', timeZone: 'Europe/Paris' })
const fmtCle = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })

function quand(t: number, maintenant: boolean): string {
  if (maintenant) return 'Maintenant'
  const j = fmtCle.format(new Date(t))
  if (j === fmtCle.format(new Date())) return `Aujourd’hui, ${heure(t)}`
  if (j === fmtCle.format(new Date(Date.now() + 86_400_000))) return `Demain, ${heure(t)}`
  const nom = fmtJour.format(new Date(t))
  return `${nom.charAt(0).toUpperCase()}${nom.slice(1)}, ${heure(t)}`
}

export interface DonneesTuile {
  t: number
  maintenant: boolean
  ciel: Ciel
  etat: string
  temp: number
  pluie: number
  nuages: number
  vent: { kmh: number; rafales: number; dir: number } | null
}

/**
 * La tuile de l'heure, posée sur la carte : ce qui se passe au point choisi
 * à l'heure du curseur. Elle suit le curseur ; rien d'autre ne bouge.
 */
export default function TuileHeure({ d, lieu }: { d: DonneesTuile; lieu: string }) {
  const pluie = d.pluie >= 0.2 ? `${d.pluie < 10 ? d.pluie.toFixed(1).replace('.', ',') : Math.round(d.pluie)} mm` : 'sec'
  return (
    <div
      className="w-[184px] rounded-[20px] px-4 pb-3 pt-3"
      style={{ background: 'rgba(255,255,255,0.96)', boxShadow: '0 6px 22px rgba(44,28,16,.16)', backdropFilter: 'blur(6px)' }}
      aria-live="polite"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[12.5px] font-extrabold text-[#2D5A3D]">{quand(d.t, d.maintenant)}</span>
        <span className="shrink-0 truncate font-caveat text-[15px] leading-none text-[#7A6A5A]">{lieu}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-2.5">
        <span className="text-[#2D5A3D]"><IconeCiel ciel={d.ciel} taille={40} /></span>
        <span className="font-title text-[36px] font-extrabold leading-none text-[#1A1209]" style={{ letterSpacing: '-0.03em' }}>{Math.round(d.temp)}°</span>
      </div>
      <p className="m-0 mt-1 truncate text-[14px] font-bold text-[#1A1209]">{d.etat}</p>
      <div className="mt-2 flex flex-col gap-1 border-t border-[#EFE8DE] pt-2 text-[12.5px] text-[#4A3F33]">
        {d.vent && (
          <span className="flex items-center gap-1.5">
            {/* La flèche pointe là où va le vent. */}
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#2D5A3D" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" style={{ transform: `rotate(${d.vent.dir + 180}deg)` }} aria-hidden>
              <path d="M12 20V4M6 10l6-6 6 6" />
            </svg>
            <span><b className="text-[#1A1209]">{d.vent.kmh} km/h</b>{d.vent.rafales > d.vent.kmh + 10 ? ` · rafales ${d.vent.rafales}` : ''}</span>
            <span className="sr-only">vent du {directionEnMots(d.vent.dir)}</span>
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#1F5296" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />
          </svg>
          <span><b className="text-[#1A1209]">{pluie}</b>{d.pluie >= 0.2 ? ' dans l’heure' : ''}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#7A6A5A" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M17.5 19H9a6 6 0 1 1 5.7-7.9A4.5 4.5 0 1 1 17.5 19z" />
          </svg>
          <span>nuages <b className="text-[#1A1209]">{Math.round(d.nuages)} %</b></span>
        </span>
      </div>
    </div>
  )
}
