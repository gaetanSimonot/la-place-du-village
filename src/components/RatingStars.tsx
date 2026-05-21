'use client'
import { useState } from 'react'

/**
 * Étoiles 1-5 :
 *  - Mode display (par défaut) : note moyenne + nb avis, étoiles non cliquables.
 *  - Mode interactive (`onChange` fourni) : 5 étoiles cliquables, hover preview.
 *
 * Reprend le système de design PDV (couleur ambre pour les étoiles, fonts héritées).
 */

interface Props {
  /** Note (0–5, peut être décimale comme 4.2). */
  value?: number | null
  /** Nombre d'avis à afficher à côté (mode display uniquement). */
  count?: number
  /** Taille des étoiles en pixels. Défaut 16. */
  size?: number
  /** Si fourni → mode interactive (clic = nouvelle note 1-5). */
  onChange?: (note: 1 | 2 | 3 | 4 | 5) => void
  /** Si true en mode interactive : désactivé pendant submit. */
  disabled?: boolean
  /** Cache le texte "X.X (N avis)" en mode display. */
  hideLabel?: boolean
  /** Wording personnalisable du label (défaut "avis"). */
  labelNoun?: string
}

export default function RatingStars({
  value,
  count = 0,
  size = 16,
  onChange,
  disabled = false,
  hideLabel = false,
  labelNoun = 'avis',
}: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const interactive = !!onChange

  // Pour le display, on calcule combien d'étoiles pleines / demi / vides
  const numericValue = typeof value === 'number' && !Number.isNaN(value) ? value : 0
  const effectiveValue = hover ?? numericValue

  return (
    <div className="inline-flex items-center gap-1.5 text-amber-500">
      <div className="inline-flex items-center gap-0.5" role={interactive ? 'radiogroup' : undefined}>
        {[1, 2, 3, 4, 5].map((i) => {
          const filled = i <= effectiveValue
          const halfFilled = !filled && i - 0.5 <= effectiveValue
          return (
            <button
              key={i}
              type="button"
              role={interactive ? 'radio' : undefined}
              aria-checked={interactive ? Math.round(numericValue) === i : undefined}
              aria-label={interactive ? `${i} étoile${i > 1 ? 's' : ''}` : undefined}
              disabled={!interactive || disabled}
              onClick={interactive ? () => onChange!(i as 1 | 2 | 3 | 4 | 5) : undefined}
              onMouseEnter={interactive && !disabled ? () => setHover(i) : undefined}
              onMouseLeave={interactive && !disabled ? () => setHover(null) : undefined}
              className={`shrink-0 ${interactive ? 'cursor-pointer p-0.5 transition-transform hover:scale-110 disabled:cursor-not-allowed disabled:opacity-50' : 'cursor-default'} border-none bg-transparent leading-none`}
              style={{ width: size + 4, height: size + 4 }}
            >
              <Star size={size} fill={filled ? 'currentColor' : halfFilled ? 'url(#half)' : 'none'} />
            </button>
          )
        })}
      </div>
      {!interactive && !hideLabel && (count > 0 ? (
        <span className="text-[12px] font-medium text-texte-doux">
          {numericValue > 0 ? numericValue.toFixed(1) : '—'}
          <span className="ml-1 text-texte-doux/70">· {count} {labelNoun}{count > 1 ? '' : ''}</span>
        </span>
      ) : (
        <span className="text-[12px] text-texte-doux/70">Pas encore d&apos;{labelNoun.endsWith('s') ? labelNoun.slice(0, -1) : labelNoun}</span>
      ))}
    </div>
  )
}

function Star({ size, fill }: { size: number; fill: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="half">
          <stop offset="50%" stopColor="currentColor" />
          <stop offset="50%" stopColor="transparent" />
        </linearGradient>
      </defs>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}
