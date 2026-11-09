'use client'
import IconeCiel from './IconeCiel'
import { COULEURS_PLUIE, COULEUR_ORAGE } from './CarteMeteo'
import { heure, nomDuJour, type Ciel, type Jour } from '@/lib/meteo/lecture'

export interface HeureAffichee { i: number; t: number; ciel: Ciel | null; temp: number | null; pluie: number | null }

const fmtJourCourt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', timeZone: 'Europe/Paris' })
const fmtJourCle = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })

/** « Maintenant », « 21h », « hier 23h », « demain 14h », « mercredi 3h ». */
function libelleInstant(t: number, maintenant: boolean): string {
  if (maintenant) return 'Maintenant'
  const j = fmtJourCle.format(new Date(t))
  if (j === fmtJourCle.format(new Date())) return heure(t)
  if (j === fmtJourCle.format(new Date(Date.now() - 86_400_000))) return `Hier ${heure(t)}`
  if (j === fmtJourCle.format(new Date(Date.now() + 86_400_000))) return `Demain ${heure(t)}`
  return `${fmtJourCourt.format(new Date(t))} ${heure(t)}`
}

/**
 * Le panneau sous la carte. Sa partie haute (phrase, curseur, heures) a une
 * hauteur FIXE : une phrase plus longue ne pousse rien, le panneau replié
 * montre toujours les heures en entier.
 *
 * Le curseur pilote la carte, et la carte seule : la rangée des heures ne
 * défile pas avec lui (ça faisait bouger tout le bas de l'écran). Toucher
 * une heure, en revanche, amène la carte à cette heure.
 */
export default function PanneauMeteo({
  etat, suite, temp, ciel, lieu, curseur, enLecture, onLecture, heures, charge, onChoisir, vueJours, onVueJours, jours, joursCharges, majLe,
}: {
  etat: string | null
  suite: string
  temp: number | null
  ciel: Ciel | null
  lieu: string
  curseur: { min: number; max: number; valeur: number; maintenant: number; t: number }
  enLecture: boolean
  onLecture: () => void
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
  const total = Math.max(1, curseur.max - curseur.min)
  const posMaintenant = ((curseur.maintenant - curseur.min) / total) * 100

  return (
    <div className="px-5 pb-8">
      {/* La phrase : l'état en gros sur une ligne, la suite dessous. */}
      <div className="flex items-center gap-3" style={{ height: 62 }}>
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate font-title text-[25px] font-extrabold leading-[1.1] text-[#1A1209]" style={{ letterSpacing: '-0.02em' }}>
            {etat ?? 'Lecture du ciel…'}
          </p>
          <p className="m-0 mt-1 flex items-baseline gap-2 truncate">
            <span className="truncate text-[16px] font-bold text-[#2D5A3D]">{suite}</span>
            <span className="shrink-0 font-caveat text-[18px] leading-none text-[#7A6A5A]">à {lieu}</span>
          </p>
        </div>
        {temp !== null && ciel && (
          <div className="flex shrink-0 items-center gap-1.5 text-[#2D5A3D]">
            <IconeCiel ciel={ciel} taille={32} />
            <span className="font-title text-[30px] font-extrabold leading-none text-[#1A1209]">{Math.round(temp)}°</span>
          </div>
        )}
      </div>

      {/* Lecture / pause, et le curseur. */}
      <div className="mt-2 flex items-center gap-3">
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
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between">
            <span className="text-[15px] font-extrabold text-[#2D5A3D]">{libelleInstant(curseur.t, curseur.valeur === curseur.maintenant)}</span>
            <Legende />
          </div>
          <div className="relative">
            <input
              type="range"
              aria-label="Heure affichée sur la carte"
              min={curseur.min} max={curseur.max} step={1} value={curseur.valeur}
              onChange={e => onChoisir(Number(e.target.value))}
              className="pdv-curseur-meteo w-full"
            />
            {/* Le repère « maintenant » : avant lui, le passé. */}
            <span
              aria-hidden
              className="pointer-events-none absolute top-[13px] h-[18px] w-[3px] rounded-full bg-[#C84B2F]"
              style={{ left: `calc(14px + (100% - 28px) * ${posMaintenant / 100} - 1.5px)` }}
            />
          </div>
          <div className="flex h-[3px] gap-[2px]" aria-hidden>
            {Array.from({ length: curseur.max - curseur.min + 1 }, (_, k) => {
              const ok = charge.has(curseur.min + k)
              return <span key={k} className="flex-1 rounded-full" style={{ background: ok ? '#2D5A3D' : '#E5DDD2', opacity: ok ? 0.3 : 1 }} />
            })}
          </div>
        </div>
      </div>

      {/* Les prochaines heures : fixes, on les fait défiler au doigt. */}
      <div className="-mx-5 mt-3 flex gap-1.5 overflow-x-auto px-5 pb-1" style={{ scrollbarWidth: 'none', touchAction: 'pan-x' }}>
        {heures.map(h => {
          const choisie = h.i === curseur.valeur
          return (
            <button
              key={h.i}
              type="button"
              onClick={() => onChoisir(h.i)}
              className="flex min-h-[96px] w-[58px] shrink-0 flex-col items-center justify-between rounded-[16px] py-2"
              style={{ background: '#FFFFFF', color: '#1A1209', border: `2px solid ${choisie ? '#2D5A3D' : 'transparent'}`, boxShadow: '0 1px 6px rgba(44,28,16,.07)' }}
            >
              <span className="text-[12.5px] font-bold" style={{ color: h.i === curseur.maintenant ? '#2D5A3D' : '#1A1209' }}>
                {h.i === curseur.maintenant ? 'Mtn' : heure(h.t)}
              </span>
              {h.ciel ? <IconeCiel ciel={h.ciel} taille={24} couleur="#2D5A3D" /> : <span className="h-6" />}
              <span className="text-[15px] font-extrabold">{h.temp !== null ? `${Math.round(h.temp)}°` : '·'}</span>
              <span className="h-[14px] text-[11px] font-bold text-[#1F5296]">
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
        {' · '}touchez la carte pour choisir un autre lieu
      </p>
    </div>
  )
}

function Legende() {
  const pastilles: [string, string][] = [[COULEURS_PLUIE[0], 'faible'], [COULEURS_PLUIE[1], 'modérée'], [COULEURS_PLUIE[2], 'forte'], [COULEUR_ORAGE, 'orage']]
  return (
    <span className="flex items-center gap-1.5" aria-label="Légende : pluie faible, modérée, forte, orage">
      {pastilles.map(([c, l]) => (
        <span key={l} className="flex items-center gap-0.5 text-[10px] text-[#7A6A5A]">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: c }} />{l}
        </span>
      ))}
    </span>
  )
}
