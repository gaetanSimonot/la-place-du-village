import { STATUTS, type Statut } from '@/lib/champignons'

/**
 * La pastille de comestibilité, aux couleurs du guide (jetons --bois-*,
 * définis par l'univers « bois » dans globals.css).
 */
const TEINTES: Record<Statut, { fond: string; encre: string }> = {
  excellent:  { fond: 'var(--bois-okBg)',   encre: 'var(--bois-ok)' },
  bon:        { fond: 'var(--bois-okBg)',   encre: 'var(--bois-ok)' },
  comestible: { fond: 'var(--bois-okBg)',   encre: 'var(--bois-ok)' },
  prudence:   { fond: 'var(--bois-warnBg)', encre: 'var(--bois-warn)' },
  non:        { fond: 'var(--bois-greyBg)', encre: 'var(--bois-grey)' },
  toxique:    { fond: 'var(--bois-toxBg)',  encre: 'var(--bois-tox)' },
  // Le mortel est le seul en aplat plein : il doit se voir de loin.
  mortel:     { fond: 'var(--bois-dead)',   encre: '#F9FAF6' },
}

export default function PastilleStatut({ statut, style }: { statut: Statut; style?: React.CSSProperties }) {
  const t = TEINTES[statut]
  return (
    <span className="inline-flex items-center"
      style={{
        gap: 5, borderRadius: 999, padding: '3px 9px', fontSize: 12, fontWeight: 700,
        letterSpacing: '.02em', lineHeight: 1.3, background: t.fond, color: t.encre, ...style,
      }}>
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor' }} />
      {STATUTS[statut]}
    </span>
  )
}
