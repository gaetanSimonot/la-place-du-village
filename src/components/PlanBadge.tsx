'use client'
import { PLANS_INFO, type Plan } from '@/lib/capabilities'

/**
 * Mini-badge affiché à côté d'un nom pour signaler le plan d'un user.
 * - 'basic' : aucun badge (pas visible)
 * - 'habitants' : 🌿 Habitants (vert)
 * - 'pro' : ★ Partenaire (bleu)
 *
 * Tailles :
 *   - 'sm' (défaut) : pour les commentaires, listes — très compact
 *   - 'md'          : pour le bloc "Mon plan" dans ProfilView
 */
export default function PlanBadge({
  plan,
  size = 'sm',
}: {
  plan: Plan | null | undefined
  size?: 'sm' | 'md'
}) {
  if (!plan || plan === 'basic') return null
  const info = PLANS_INFO[plan]

  const isSm = size === 'sm'
  return (
    <span
      title={info.tagline}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: isSm ? 3 : 4,
        fontSize: isSm ? 9 : 11,
        fontWeight: 800,
        color: info.color,
        backgroundColor: info.bgColor,
        borderRadius: 999,
        padding: isSm ? '2px 6px' : '3px 9px',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
        verticalAlign: 'middle',
        flexShrink: 0,
      }}
    >
      <span aria-hidden style={{ fontSize: isSm ? 10 : 12 }}>{info.icon}</span>
      {plan === 'pro' ? 'Partenaire' : 'Habitants'}
    </span>
  )
}
