'use client'
import { motion } from 'framer-motion'

type Tab = 'carte' | 'liste' | 'profil'

interface Props {
  active: Tab
  onChange: (tab: Tab) => void
}

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'carte',  label: 'Carte',  icon: '🗺️' },
  { id: 'liste',  label: 'Liste',  icon: '📋' },
  { id: 'profil', label: 'Profil', icon: '👤' },
]

export default function BottomNav({ active, onChange }: Props) {
  return (
    <nav
      className="shrink-0 bg-white border-t border-[#EDE8E0] flex pb-safe"
      style={{ minHeight: 64 }}
    >
      {TABS.map(tab => {
        const isActive = active === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 relative py-2"
            style={{ minHeight: 56 }}
            aria-label={tab.label}
          >
            <span className="text-xl leading-none">{tab.icon}</span>
            <span
              className="text-[11px] font-semibold transition-colors"
              style={{ color: isActive ? 'var(--orange)' : 'var(--gris)' }}
            >
              {tab.label}
            </span>
            {isActive && (
              <motion.span
                layoutId="nav-indicator"
                className="absolute top-0 left-4 right-4 h-[2px] rounded-b-full"
                style={{ backgroundColor: 'var(--orange)' }}
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              />
            )}
          </button>
        )
      })}
    </nav>
  )
}
