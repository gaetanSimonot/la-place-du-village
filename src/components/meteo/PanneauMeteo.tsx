'use client'
import { useEffect, useRef } from 'react'
import IconeCiel from './IconeCiel'
import { COULEURS_PLUIE, COULEUR_ORAGE } from './CarteMeteo'
import { heure, nomDuJour, type Ciel, type Jour } from '@/lib/meteo/lecture'

export interface HeureAffichee { i: number; t: number; ciel: Ciel | null; temp: number | null; pluie: number | null }

const fmtJourCourt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', timeZone: 'Europe/Paris' })
const fmtJourCle = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })

/** « Maintenant », « 21h », « demain 14h », « mercredi 3h ». */
function libelleInstant(t: number, maintenant: boolean): string {
  if (maintenant) return 'Maintenant'
  const j = fmtJourCle.format(new Date(t))
  if (j === fmtJourCle.format(new Date())) return heure(t)
  if (j === fmtJourCle.format(new Date(Date.now() + 86_400_000))) return `Demain ${heure(t)}`
  return `${fmtJourCourt.format(new Date(t))} ${heure(t)}`
}

export default function PanneauMeteo({
  phrase, temp, ciel, lieu, curseur, heures, charge, onChoisir, vueJours, onVueJours, jours, joursCharges, majLe,
}: {
  phrase: string | null
  temp: number | null
  ciel: Ciel | null
  lieu: string
  /** Index affiché dans le curseur, et les bornes. */
  curseur: { min: number; max: number; valeur: number; t: number }
  heures: HeureAffichee[]
  /** Images déjà chargées, par index — le curseur montre le préchargement. */
  charge: Set<number>
  onChoisir: (i: number) => void
  vueJours: 3 | 10 | null
  onVueJours: (v: 3 | 10 | null) => void
  jours: Jour[] | null
  joursCharges: boolean
  majLe: string | null
}) {
  const rangee = useRef<HTMLDivElement>(null)
  // La case de l'heure choisie reste visible dans la rangée. Défilement de la
  // rangée SEULE : scrollIntoView ferait aussi défiler la page entière.
  useEffect(() => {
    const r = rangee.current
    const el = r?.querySelector<HTMLElement>(`[data-i="${curseur.valeur}"]`)
    if (!r || !el) return
    const g = el.offsetLeft - r.offsetLeft, d = g + el.offsetWidth
    if (g < r.scrollLeft + 20) r.scrollTo({ left: Math.max(0, g - 20), behavior: 'smooth' })
    else if (d > r.scrollLeft + r.clientWidth - 20) r.scrollTo({ left: d - r.clientWidth + 20, behavior: 'smooth' })
  }, [curseur.valeur])

  const total = curseur.max - curseur.min
  const chargees = Array.from({ length: total + 1 }, (_, k) => charge.has(curseur.min + k))

  return (
    <div className="px-5 pb-8 pt-0.5">
      {/* La phrase, en gros. */}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="m-0 font-title text-[24px] font-extrabold leading-[1.15] text-[#1A1209]" style={{ letterSpacing: '-0.02em' }}>
            {phrase ?? 'Lecture du ciel…'}
          </p>
          <p className="m-0 mt-1 font-caveat text-[19px] leading-none text-[#7A6A5A]">à {lieu}</p>
        </div>
        {temp !== null && ciel && (
          <div className="flex shrink-0 flex-col items-center text-[#2D5A3D]">
            <IconeCiel ciel={ciel} taille={34} />
            <span className="font-title text-[26px] font-extrabold leading-none text-[#1A1209]">{Math.round(temp)}°</span>
          </div>
        )}
      </div>

      {/* Le curseur des heures. Sous la piste, ce qui est déjà chargé. */}
      <div className="mt-3">
        <div className="-mb-1 flex items-baseline justify-between">
          <span className="text-[15px] font-extrabold text-[#2D5A3D]">{libelleInstant(curseur.t, curseur.valeur === curseur.min)}</span>
          <Legende />
        </div>
        <input
          type="range"
          aria-label="Heure affichée sur la carte"
          min={curseur.min} max={curseur.max} step={1} value={curseur.valeur}
          onChange={e => onChoisir(Number(e.target.value))}
          className="pdv-curseur-meteo w-full"
        />
        <div className="mt-0.5 flex h-[3px] gap-[2px]" aria-hidden>
          {chargees.map((ok, k) => <span key={k} className="flex-1 rounded-full" style={{ background: ok ? '#2D5A3D' : '#E5DDD2', opacity: ok ? 0.35 : 1 }} />)}
        </div>
      </div>

      {/* Les prochaines heures. */}
      <div ref={rangee} className="-mx-5 mt-3 flex gap-1.5 overflow-x-auto px-5 pb-1" style={{ scrollbarWidth: 'none' }}>
        {heures.map(h => {
          const actif = h.i === curseur.valeur
          return (
            <button
              key={h.i}
              data-i={h.i}
              type="button"
              onClick={() => onChoisir(h.i)}
              className="flex min-h-[96px] w-[58px] shrink-0 flex-col items-center justify-between rounded-[16px] border-none py-2"
              style={{ background: actif ? '#2D5A3D' : '#FFFFFF', color: actif ? '#FFFFFF' : '#1A1209', boxShadow: actif ? 'none' : '0 1px 6px rgba(44,28,16,.07)' }}
            >
              <span className="text-[12.5px] font-bold">{h.i === curseur.min ? 'Mtn' : heure(h.t)}</span>
              {h.ciel ? <IconeCiel ciel={h.ciel} taille={24} couleur={actif ? '#FFFFFF' : '#2D5A3D'} /> : <span className="h-6" />}
              <span className="text-[15px] font-extrabold">{h.temp !== null ? `${Math.round(h.temp)}°` : '·'}</span>
              <span className="h-[14px] text-[11px] font-bold" style={{ color: actif ? '#D8E8F7' : '#1F5296' }}>
                {h.pluie !== null && h.pluie >= 0.2 ? `${h.pluie < 10 ? h.pluie.toFixed(1).replace('.', ',') : Math.round(h.pluie)} mm` : ''}
              </span>
            </button>
          )
        })}
      </div>

      {/* 3 jours / 10 jours. */}
      <div className="mt-5 flex gap-2">
        {([3, 10] as const).map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onVueJours(vueJours === n ? null : n)}
            className="h-11 flex-1 rounded-full text-[14px] font-extrabold"
            style={{ border: `1.5px solid ${vueJours === n ? '#2D5A3D' : '#E5DDD2'}`, background: vueJours === n ? '#2D5A3D' : '#FFFFFF', color: vueJours === n ? '#FFFFFF' : '#1A1209' }}
          >
            {n} jours
          </button>
        ))}
      </div>

      {vueJours && (
        <div className="mt-3 overflow-hidden rounded-[18px] bg-white" style={{ boxShadow: '0 1px 6px rgba(44,28,16,.07)' }}>
          {!joursCharges && <p className="m-0 p-4 text-[14px] text-[#7A6A5A]">Chargement…</p>}
          {joursCharges && (!jours || jours.length === 0) && <p className="m-0 p-4 text-[14px] text-[#7A6A5A]">Prévisions des jours indisponibles pour l’instant.</p>}
          {jours?.map((j, k) => (
            <div key={j.date} className="flex min-h-[52px] items-center gap-3 px-4" style={{ borderTop: k ? '1px solid #F2ECE3' : 'none' }}>
              <span className="w-[92px] shrink-0 text-[15px] font-bold capitalize text-[#1A1209]">{nomDuJour(j.date)}</span>
              <IconeCiel ciel={j.ciel} taille={26} couleur="#2D5A3D" />
              <span className="flex-1 text-[12.5px] font-bold text-[#1F5296]">
                {j.pluie >= 1 ? `${Math.round(j.pluie)} mm` : ''}
              </span>
              <span className="text-[15px] text-[#7A6A5A]">{Math.round(j.min)}°</span>
              <span className="w-9 text-right text-[16px] font-extrabold text-[#1A1209]">{Math.round(j.max)}°</span>
            </div>
          ))}
        </div>
      )}

      <p className="m-0 mt-5 text-[11.5px] leading-[1.5] text-[#8A7A6A]">
        Source : Météo-France (AROME){vueJours ? ' · ECMWF pour les jours' : ''}
        {majLe ? ` · mis à jour à ${majLe}` : ''}
      </p>
    </div>
  )
}

function Legende() {
  const pastilles: [string, string][] = [[COULEURS_PLUIE[0], 'faible'], [COULEURS_PLUIE[1], 'modérée'], [COULEURS_PLUIE[2], 'forte'], [COULEUR_ORAGE, 'orage']]
  return (
    <span className="flex items-center gap-2" aria-label="Légende : pluie faible, modérée, forte, orage">
      {pastilles.map(([c, l]) => (
        <span key={l} className="flex items-center gap-1 text-[10.5px] text-[#7A6A5A]">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c }} />{l}
        </span>
      ))}
    </span>
  )
}
