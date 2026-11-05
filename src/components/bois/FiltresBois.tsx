'use client'
import { COULEURS, MILIEUX, type Couleur, type Milieu } from '@/lib/champignons'

/**
 * Les quatre portes du guide, en ronds de couleur — dessinées d'après le
 * visuel de communication de Gaëtan : Par couleur · Par milieu · Recettes &
 * cuisine · Sosies maléfiques.
 *
 * Les deux premières DÉPLIENT un choix (couleurs du chapeau, milieux) ; les
 * deux dernières sont des bascules : « Recettes » ne garde que ce qui se
 * cuisine, « Sosies maléfiques » que ce qu'il faut savoir reconnaître pour
 * l'éviter. Elles s'excluent l'une l'autre.
 */

export type Panneau = 'couleur' | 'milieu' | null
export type Bascule = 'recettes' | 'sosies' | null

const PORTES: { id: 'couleur' | 'milieu' | 'recettes' | 'sosies'; label: string; teinte: string; icone: React.ReactNode }[] = [
  {
    id: 'couleur', label: 'Par couleur', teinte: '#D9662A',
    icone: (
      // Une palette de peintre.
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.7-.9 1.4-1.9-.3-.9.3-1.9 1.3-1.9H17a4 4 0 0 0 4-4c0-5.6-4-10.2-9-10.2z" />
        <circle cx="7.5" cy="11" r="1.2" /><circle cx="10" cy="7" r="1.2" /><circle cx="15" cy="7.5" r="1.2" />
      </svg>
    ),
  },
  {
    id: 'milieu', label: 'Par milieu naturel', teinte: '#2C6636',
    icone: (
      // Un sapin.
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2 6.5 9.5h3L5 15.5h4L5.5 20.5h13L15 15.5h4l-4.5-6h3z" /><line x1="12" y1="20.5" x2="12" y2="23" />
      </svg>
    ),
  },
  {
    id: 'recettes', label: 'Recettes & cuisine', teinte: '#7B4FA0',
    icone: (
      // Fourchette et couteau.
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 2v8a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V2" /><line x1="9" y1="2" x2="9" y2="22" />
        <path d="M17 22V2c-2.2 1.2-3.5 4-3.5 7.5S14.8 13 17 13" />
      </svg>
    ),
  },
  {
    id: 'sosies', label: 'Sosies maléfiques', teinte: '#C2272D',
    icone: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
]

export default function FiltresBois({
  panneau, bascule, couleur, milieu,
  onPanneau, onBascule, onCouleur, onMilieu,
}: {
  panneau: Panneau
  bascule: Bascule
  couleur: Couleur | null
  milieu: Milieu | null
  onPanneau: (p: Panneau) => void
  onBascule: (b: Bascule) => void
  onCouleur: (c: Couleur | null) => void
  onMilieu: (m: Milieu | null) => void
}) {
  return (
    <>
      <div className="grid grid-cols-4 gap-2 px-3 pt-4">
        {PORTES.map(p => {
          // Une porte est « allumée » si son panneau est ouvert, sa bascule
          // active, ou si un choix y est retenu (panneau refermé).
          const actif = p.id === 'couleur' ? panneau === 'couleur' || !!couleur
            : p.id === 'milieu' ? panneau === 'milieu' || !!milieu
            : bascule === p.id
          const clic = () => {
            if (p.id === 'couleur' || p.id === 'milieu') onPanneau(panneau === p.id ? null : p.id)
            else onBascule(bascule === p.id ? null : p.id)
          }
          return (
            <button key={p.id} type="button" onClick={clic} aria-pressed={actif}
              className="flex flex-col items-center gap-1.5 border-none bg-transparent p-0">
              <span className="flex items-center justify-center rounded-full text-white"
                style={{
                  width: 52, height: 52, background: p.teinte,
                  boxShadow: actif
                    ? `0 0 0 3px var(--uni-bg), 0 0 0 5px ${p.teinte}`
                    : '0 3px 8px rgba(30,36,31,.18)',
                }}>
                {p.icone}
              </span>
              <span className="text-center text-[11.5px] font-bold leading-tight"
                style={{ color: actif ? p.teinte : 'var(--uni-ink)' }}>
                {p.label}
              </span>
            </button>
          )
        })}
      </div>

      {panneau === 'couleur' && (
        <Volet>
          <div className="flex flex-wrap justify-center gap-2.5">
            {COULEURS.map(c => {
              const actif = couleur === c.id
              return (
                <button key={c.id} type="button" onClick={() => onCouleur(actif ? null : c.id)}
                  aria-label={c.label} aria-pressed={actif}
                  className="flex flex-col items-center gap-1 border-none bg-transparent p-0" style={{ width: 52 }}>
                  <span className="flex items-center justify-center rounded-full"
                    style={{
                      width: 34, height: 34, background: c.teinte,
                      boxShadow: actif ? '0 0 0 2px var(--uni-panel), 0 0 0 4px var(--uni-accent)' : 'inset 0 0 0 1px rgba(30,36,31,.18)',
                    }}>
                    {actif && (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.id === 'blanc' || c.id === 'jaune' ? '#1E241F' : '#FFFFFF'} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </span>
                  <span className="text-[10.5px] font-semibold leading-tight" style={{ color: actif ? 'var(--uni-accent2)' : 'var(--uni-dim)' }}>
                    {c.label.split(',')[0]}
                  </span>
                </button>
              )
            })}
          </div>
        </Volet>
      )}

      {panneau === 'milieu' && (
        <Volet>
          <div className="flex flex-wrap justify-center gap-1.5">
            {MILIEUX.map(m => {
              const actif = milieu === m.id
              return (
                <button key={m.id} type="button" onClick={() => onMilieu(actif ? null : m.id)}
                  className="whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-bold"
                  style={{
                    border: `1.5px solid ${actif ? '#2C6636' : 'var(--uni-line)'}`,
                    background: actif ? '#2C6636' : 'transparent',
                    color: actif ? '#FFFFFF' : 'var(--uni-dim)',
                  }}>
                  {m.court}
                </button>
              )
            })}
          </div>
        </Volet>
      )}
    </>
  )
}

function Volet({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-4 mt-3.5 rounded-2xl"
      style={{ padding: '12px 12px 14px', background: 'var(--uni-panel)', border: '1px solid var(--uni-line)' }}>
      {children}
    </div>
  )
}
