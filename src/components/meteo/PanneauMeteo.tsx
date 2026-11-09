'use client'
import IconeCiel from './IconeCiel'
import FriseHeures, { type Colonne } from './FriseHeures'
import { heure, nomDuJour, directionEnMots, type Ciel, type Jour } from '@/lib/meteo/lecture'
import { COULEURS_PLUIE, COULEUR_ORAGE } from '@/lib/meteo/zone'

const fmtJour = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', timeZone: 'Europe/Paris' })
const fmtCle = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })

/** « Maintenant », « Aujourd'hui, 23h », « Demain, 14h », « Mercredi, 3h ». */
export function quand(t: number, maintenant: boolean): string {
  if (maintenant) return 'Maintenant'
  const j = fmtCle.format(new Date(t))
  if (j === fmtCle.format(new Date())) return `Aujourd’hui, ${heure(t)}`
  if (j === fmtCle.format(new Date(Date.now() + 86_400_000))) return `Demain, ${heure(t)}`
  const nom = fmtJour.format(new Date(t))
  return `${nom.charAt(0).toUpperCase()}${nom.slice(1)}, ${heure(t)}`
}

/** Ce qui se passe au point choisi, à l'heure sous l'aiguille. */
export interface DonneesHeure {
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
 * Le panneau sous la carte. En haut, à hauteur FIXE (rien ne pousse rien) :
 * l'heure choisie en grand, puis la frise qu'on fait glisser sous l'aiguille.
 * Plus bas, quand on le remonte : la légende, les jours, la source.
 */
export default function PanneauMeteo({
  h, suite, lieu, colonnes, iSel, onChoisir, enLecture, onLecture, ouvert, vueJours, onVueJours, jours, joursCharges, majLe,
}: {
  h: DonneesHeure | null
  suite: string
  lieu: string
  colonnes: Colonne[]
  iSel: number
  onChoisir: (i: number) => void
  enLecture: boolean
  onLecture: () => void
  ouvert: boolean
  vueJours: 3 | 10
  onVueJours: (v: 3 | 10) => void
  jours: Jour[] | null
  joursCharges: boolean
  majLe: string | null
}) {
  const pluie = h && h.pluie >= 0.2 ? `${h.pluie < 10 ? h.pluie.toFixed(1).replace('.', ',') : Math.round(h.pluie)} mm` : 'sec'
  return (
    <div className="pb-8">
      {/* L'heure choisie : le ciel et la température en grand. */}
      <div className="flex items-start gap-3 px-5" style={{ height: 86 }} aria-live="polite">
        {h ? (
          <>
            <div className="flex shrink-0 items-center gap-1 text-[#2D5A3D]">
              <IconeCiel ciel={h.ciel} taille={42} />
              <span className="font-title text-[46px] font-extrabold leading-none text-[#1A1209]" style={{ letterSpacing: '-0.04em' }}>{Math.round(h.temp)}°</span>
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="m-0 flex items-baseline gap-2">
                <span className="shrink-0 text-[14px] font-extrabold text-[#2D5A3D]">{quand(h.t, h.maintenant)}</span>
                <span className="shrink-0 truncate font-caveat text-[17px] leading-none text-[#7A6A5A]">à {lieu}</span>
              </p>
              <p className="m-0 mt-0.5 truncate font-title text-[20px] font-extrabold leading-[1.15] text-[#1A1209]">{h.etat}</p>
              <p className="m-0 mt-1 flex items-center gap-3 truncate text-[13px] text-[#4A3F33]">
                {h.maintenant && suite && <span className="shrink-0 font-bold text-[#2D5A3D]">{suite}</span>}
                <>
                    {h.vent && (
                      <span className="flex shrink-0 items-center gap-1">
                        {/* La flèche pointe là où va le vent. */}
                        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#2D5A3D" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" style={{ transform: `rotate(${h.vent.dir + 180}deg)` }} aria-hidden>
                          <path d="M12 20V4M6 10l6-6 6 6" />
                        </svg>
                        <b className="text-[#1A1209]">{h.vent.kmh}</b> km/h
                        {h.vent.rafales > h.vent.kmh + 10 && <span className="text-[#7A6A5A]">· raf. {h.vent.rafales}</span>}
                        <span className="sr-only">vent du {directionEnMots(h.vent.dir)}</span>
                      </span>
                    )}
                    {!(h.maintenant && suite) && (
                      <span className="flex shrink-0 items-center gap-1">
                        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#1F5296" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />
                        </svg>
                        <b className="text-[#1A1209]">{pluie}</b>
                      </span>
                    )}
                </>
              </p>
            </div>
            <button
              type="button"
              onClick={onLecture}
              aria-label={enLecture ? 'Mettre en pause' : 'Faire défiler les heures'}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-none text-white"
              style={{ background: '#2D5A3D' }}
            >
              {enLecture
                ? <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                : <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>}
            </button>
          </>
        ) : (
          <p className="m-0 pt-3 font-title text-[22px] font-extrabold text-[#1A1209]">Lecture du ciel…</p>
        )}
      </div>

      {/* La frise : on la fait glisser, la carte suit. */}
      <FriseHeures colonnes={colonnes} valeur={iSel} onChoisir={onChoisir} panneauOuvert={ouvert} />

      <div className="px-5">
        <div className="mt-2"><Legende /></div>

        {/* 3 jours (affiché d'office) / 10 jours. */}
        <div className="mt-4 flex gap-2">
          {([3, 10] as const).map(n => (
            <button
              key={n}
              type="button"
              onClick={() => onVueJours(n)}
              className="h-11 flex-1 rounded-full text-[14px] font-extrabold"
              style={{ border: `1.5px solid ${vueJours === n ? '#2D5A3D' : '#E5DDD2'}`, background: vueJours === n ? '#2D5A3D' : '#FFFFFF', color: vueJours === n ? '#FFFFFF' : '#1A1209' }}
            >
              {n} jours
            </button>
          ))}
        </div>

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

        <p className="m-0 mt-5 text-[11.5px] leading-[1.5] text-[#8A7A6A]">
          Source : Météo-France (AROME) · ECMWF pour les jours
          {majLe ? ` · mis à jour à ${majLe}` : ''}
          {' · '}touchez la carte pour choisir un autre lieu
        </p>
      </div>
    </div>
  )
}

function Legende() {
  const pastilles: [string, string][] = [[COULEURS_PLUIE[0], 'faible'], [COULEURS_PLUIE[1], 'modérée'], [COULEURS_PLUIE[2], 'forte'], [COULEUR_ORAGE, 'orage']]
  return (
    <span className="flex items-center gap-2" aria-label="Légende : pluie faible, modérée, forte, orage">
      {pastilles.map(([c, l]) => (
        <span key={l} className="flex items-center gap-1 text-[11px] text-[#7A6A5A]">
          <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: c }} />{l}
        </span>
      ))}
    </span>
  )
}
