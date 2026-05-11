'use client'
import { PLANS_INFO, type Plan } from '@/lib/capabilities'

/**
 * 2 modales utilisées par le Hub :
 *   - ComingSoonModal : "Bientôt disponible — On y travaille"
 *   - UpgradeModal    : "Cette section nécessite Pro/Max"
 *
 * Les deux sont des bottom sheets simples cliquables hors-zone pour fermer.
 */

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 3000,
        backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480, backgroundColor: '#fff',
          borderRadius: '24px 24px 0 0', padding: '28px 24px 32px',
          paddingBottom: 'max(28px, env(safe-area-inset-bottom, 28px))',
        }}
      >
        {children}
      </div>
    </div>
  )
}

export function ComingSoonModal({ label, onClose }: { label: string; onClose: () => void }) {
  return (
    <Modal onClose={onClose}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>🚧</div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#1A1209', margin: '0 0 8px', letterSpacing: '-0.01em' }}>
          {label}
        </h2>
        <p style={{ fontSize: 14, color: '#7A6A5A', margin: '0 0 24px', lineHeight: 1.6 }}>
          Ce module arrive bientôt. Reviens plus tard !
        </p>
        <button
          onClick={onClose}
          style={{
            width: '100%', padding: '14px',
            backgroundColor: 'var(--primary)', color: '#fff',
            border: 'none', borderRadius: 14,
            fontSize: 14, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'Inter, sans-serif',
          }}
        >
          OK
        </button>
      </div>
    </Modal>
  )
}

export function UpgradeModal({
  requiredPlan,
  label,
  onClose,
  onGoToPlan,
}: {
  requiredPlan: 'pro' | 'max'
  label: string
  onClose: () => void
  onGoToPlan: () => void
}) {
  const info = PLANS_INFO[requiredPlan as Plan]
  return (
    <Modal onClose={onClose}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          backgroundColor: info.bgColor, color: info.color,
          fontSize: 32, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 14px',
        }}>
          {info.icon}
        </div>

        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#1A1209', margin: '0 0 6px', letterSpacing: '-0.01em' }}>
          {label}
        </h2>
        <p style={{ fontSize: 13, color: '#7A6A5A', margin: '0 0 18px' }}>
          Cette section nécessite un abonnement <strong style={{ color: info.color }}>{info.label}</strong>.
        </p>

        {/* Liste des features du plan */}
        <ul style={{
          margin: '0 0 22px', padding: '14px 16px',
          listStyle: 'none', textAlign: 'left',
          backgroundColor: info.bgColor,
          borderRadius: 14,
        }}>
          {info.features.slice(0, 4).map(f => (
            <li key={f} style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              fontSize: 13, color: '#2C1810', lineHeight: 1.4,
              padding: '3px 0',
            }}>
              <span style={{ color: info.color, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>✓</span>
              {f}
            </li>
          ))}
        </ul>

        <button
          onClick={onGoToPlan}
          style={{
            width: '100%', padding: '14px',
            backgroundColor: info.color, color: '#fff',
            border: 'none', borderRadius: 14,
            fontSize: 14, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'Inter, sans-serif',
            marginBottom: 8,
          }}
        >
          Découvrir l&apos;abonnement {info.label}
        </button>
        <button
          onClick={onClose}
          style={{
            width: '100%', padding: '10px',
            background: 'none', border: 'none',
            fontSize: 12, color: '#9A8A7A',
            cursor: 'pointer', fontFamily: 'Inter, sans-serif',
          }}
        >
          Plus tard
        </button>
      </div>
    </Modal>
  )
}
